node-cqrs/redis
===============

> **Experimental** — the Redis module is new and has not been validated in production. APIs may change in minor versions.

Redis-backed persistent views for `node-cqrs`. Use this package when projections need to survive process restarts, share state across instances, or coordinate catch-up restores without duplicate processing.

## viewModelRedisFactory

Register `viewModelRedisFactory` to provide the Redis client used by views and lockers. The factory can be async, which is useful when connection settings must be loaded before connecting.

```ts
import Redis from 'ioredis';

builder.registerInstance(async () => {
	const credentials = await loadCredentials();
	return new Redis(credentials.url);
}, 'viewModelRedisFactory');
```

Alternatively, register a `Redis` instance directly as `viewModelRedis` when you already have a connected client (common in tests):

```ts
builder.registerInstance(new Redis(), 'viewModelRedis');
```

## AbstractRedisProjection\<T\>

Use `AbstractRedisProjection<T>` for the common case where each aggregate maps to one JSON-like record in Redis. Define a table name and schema version, then update records from event handlers through `this.view`.

Records are stored at keys `{tableName}_{schemaVersion}:{id}`. When `schemaVersion` changes, old keys are ignored and the projection rebuilds from scratch.

```ts
import { AbstractRedisProjection } from 'node-cqrs/redis';

class UsersProjection extends AbstractRedisProjection<UserRecord> {
	static get tableName() { return 'users'; }
	static get schemaVersion() { return '1'; }

	async userCreated(event: UserCreatedEvent) {
		await this.view.updateEnforcingNew(String(event.aggregateId), () => ({
			username: event.payload.username
		}));
	}
}

builder.registerProjection(UsersProjection, 'users');
```

## RedisView\<T\>

`RedisView<T>` is the view object exposed as `this.view` in `AbstractRedisProjection`. It implements `IObjectStorage`, `IViewLocker`, and `IEventLocker`, enabling restore coordination and per-event deduplication across processes.

Use it directly when you need finer control over the view lifecycle or want to compose it into a custom projection:

```ts
import { RedisView } from 'node-cqrs/redis';

const view = new RedisView<UserRecord>({
	projectionName: 'UsersProjection',
	schemaVersion: '1',
	tableNamePrefix: 'users',
	viewModelRedisFactory
});

await view.get(userId);
await view.updateEnforcingNew(userId, existing => ({ ...existing, status: 'active' }));
```

## RedisObjectStorage\<T\>

Use `RedisObjectStorage<T>` when you need a standalone key/value store backed by Redis without the view locking and checkpoint machinery. Each record is stored as `{tableName}:{id}` and updated with optimistic concurrency control via a Lua script — concurrent writers retry automatically up to `maxRetries` times.

```ts
import { RedisObjectStorage } from 'node-cqrs/redis';

const storage = new RedisObjectStorage<SessionRecord>({
	tableName: 'sessions',
	viewModelRedisFactory
});

await storage.create(sessionId, { userId, createdAt: Date.now() });
await storage.update(sessionId, s => ({ ...s, lastSeen: Date.now() }));
await storage.delete(sessionId);
```

## RedisViewLocker

`RedisViewLocker` coordinates restore across multiple processes: only one process rebuilds a projection at a time. It uses a Redis key with `NX+PX` semantics and auto-prolongs the lock at half the TTL interval so it never expires while processing.

It is used internally by `RedisView`. Construct it directly only when building a custom view outside `AbstractRedisProjection`.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `projectionName` | required | Unique name for the projection. Used as part of the lock key. |
| `schemaVersion` | required | Schema version. A version change causes the projection to rebuild. |
| `keyPrefix` | `ncqrs` | Redis key namespace prefix. Useful for separating environments on a shared Redis instance. |
| `viewLockTtl` | `120000` | Lock TTL in milliseconds. Auto-prolonged at half the interval. |

## RedisEventLocker

`RedisEventLocker` prevents duplicate event processing when multiple instances race to project the same event. Each event transitions atomically through `processing` → `processed` states via Lua scripts. If the `processing` marker expires (default 15 s) without being finalized, another instance can re-acquire it.

It is used internally by `RedisView`. Construct it directly only when building a custom view outside `AbstractRedisProjection`.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `projectionName` | required | Unique name for the projection. |
| `schemaVersion` | required | Schema version. |
| `keyPrefix` | `ncqrs` | Redis key namespace prefix. |
| `eventLockTtl` | `15000` | TTL in milliseconds for the `processing` marker. |

## Examples

See [examples/redis/index.ts](../../examples/redis/index.ts) for a runnable projection example.
