node-cqrs/redis
===============

Redis support for `node-cqrs` provides:

- document-like projection views stored as JSON values;
- optimistic updates when several application instances modify the same record;
- distributed coordination for projection restore and event processing.

> **Experimental** - not yet validated in production. APIs may change in minor versions.

## Installation

Install the Redis client alongside `node-cqrs`:

```bash
npm install node-cqrs ioredis
```

The application owns the Redis client supplied to the adapter and must close it during shutdown.

## Choose what you need

| Requirement | Use |
|---|---|
| Store a document-like or key/value read model | `AbstractRedisProjection` |
| Compose a custom projection lifecycle | The lower-level APIs under [Advanced APIs](#advanced-apis) |

The Redis module provides views, not event storage. Pair it with any event-storage implementation that fits the
application's deployment.

## Client setup

For most applications, create one Redis client and register it directly:

```ts
import { Redis } from 'ioredis';
import { ContainerBuilder } from 'node-cqrs';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const builder = new ContainerBuilder();

builder.registerInstance(redis, 'viewModelRedis');
```

Use `viewModelRedisFactory` when credentials must be resolved asynchronously. Cache the client so every accessor
uses the same application-owned connection:

```ts
import type { IContainer } from 'node-cqrs';

type CredentialsStore = {
	getRedisUrl(): Promise<string> | string;
};

interface DatabaseContainer extends IContainer {
	credentialsStore: CredentialsStore;
}

const builder = new ContainerBuilder<DatabaseContainer>();
let redis: Redis | undefined;

builder.register(container => async () => {
	if (redis)
		return redis;

	const url = await container.credentialsStore.getRedisUrl();
	redis ??= new Redis(url);
	return redis;
}, 'viewModelRedisFactory');
```

Close the retained client during shutdown with `await redis?.quit()`.

## Document views

Use `AbstractRedisProjection` when each read-model record is naturally addressed by id and can be stored as one
JSON value.

```ts
import type { IEvent } from 'node-cqrs';
import { AbstractRedisProjection } from 'node-cqrs/redis';

type UserRecord = {
	username: string;
};

class UsersProjection extends AbstractRedisProjection<UserRecord> {
	static override get tableName() {
		return 'users';
	}

	static override get schemaVersion() {
		return '1';
	}

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.create(event.aggregateId!, {
			username: event.payload!.username
		});
	}

	async userRenamed(event: IEvent<{ username: string }>) {
		await this.view.update(event.aggregateId!, user => ({
			...user,
			username: event.payload!.username
		}));
	}
}
```

Register the projection and expose its view through the container:

```ts
import {
	ContainerBuilder,
	EventIdAugmentor,
	InMemoryEventStorage,
	type IContainer
} from 'node-cqrs';
import type { RedisView } from 'node-cqrs/redis';

interface AppContainer extends IContainer {
	usersView: RedisView<UserRecord>;
}

const builder = new ContainerBuilder<AppContainer>();
builder.registerInstance(redis, 'viewModelRedis');
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
builder.registerProjection(UsersProjection, 'usersView');

const { usersView, restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);

const user = await usersView.get(userId);
```

Persistent view checkpoints require every event to have an `id`. Register `EventIdAugmentor` when the selected
event-storage pipeline does not assign ids before projection delivery.

Records use keys `${tableName}_${schemaVersion}:${id}` and contain JSON with the record and its update version.
Concurrent updates use a Lua script to compare that version and retry when it changes. Update callbacks may run
more than once and must not perform external side effects.

## Runtime processing

Redis views coordinate event handling across application instances. A projection first claims an event, runs
its handler, marks the event as processed, and saves its checkpoint. The claim and processed transitions are
individually atomic Lua operations, so only one instance can claim a given event at a time.

The complete sequence is not transactional with the view mutation. If processing stops after the mutation but
before the processed marker, a later retry can apply the handler again. If it stops earlier, the processing key
expires after the event lock TTL, but the event is retried only when it is delivered or restored again; there is
no background retry scheduler. Projection handlers should be retryable, and the application must decide how
failed runtime deliveries are retried.

## Restore and schema versions

On startup, a projection resumes after its last checkpoint. A distributed lock ensures that only one application
instance restores a projection and schema version at a time. The lock is prolonged while held; other instances
wait and then continue from the resulting checkpoint.

Change `schemaVersion` when a read model must be replayed. Object records, processing markers, and checkpoints
use the schema version in their keys, so the new projection starts with a separate namespace. Old keys are not
deleted automatically.

Wait for `restorePromises` before serving requests that depend on projections. `RedisView.get()` also waits for
an in-progress local restore.

## Configuration

| Option | Default | Purpose |
|---|---|---|
| `viewModelRedis` | - | Existing `ioredis` client used by views |
| `viewModelRedisFactory` | - | Lazy Redis client factory; use instead of `viewModelRedis` |
| `tableName` / `tableNamePrefix` | - | Namespace for object-record keys |
| `keyPrefix` | `ncqrs` | Namespace for restore locks, event markers, and checkpoints |
| `eventLockTtl` | `15_000` ms | Time after which an abandoned processing claim expires |
| `viewLockTtl` | `120_000` ms | Restore lock duration; prolonged automatically while held |

`AbstractRedisProjection` uses the default lock settings. Construct `RedisView` directly when a custom key
prefix or TTL is required.

## Operations

- Configure Redis persistence according to the durability required from the view.
- Disable eviction for view keys. If Redis evicts a record but retains the projection checkpoint, the missing
  record is not rebuilt automatically.
- Processed-event markers do not expire. Plan capacity for one marker per event and projection schema version.
- Schema-version changes leave previous object records, processed-event markers, and checkpoints in Redis.
  Remove obsolete namespaces after the new view is ready.
- `keyPrefix` applies to locking and checkpoint keys. Include an application or environment prefix in
  `tableName` when object records also need isolation on a shared Redis deployment.
- The adapter does not close the supplied client.

## Advanced APIs

Most consumers do not need to construct these classes directly:

| Class | Use directly when |
|---|---|
| `RedisView` | A custom projection needs standard object storage and locking with custom options |
| `RedisObjectStorage` | A custom projection needs Redis-backed object storage without locking or checkpoints |
| `RedisViewLocker` | A custom component needs distributed restore or migration locking |
| `RedisEventLocker` | A custom projection needs event deduplication and checkpoints |

## Run locally

Start Redis:

```bash
docker run --name node-cqrs-redis -p 6379:6379 -d redis:7-alpine
```

Run the document-view example:

```bash
npm run example:redis
```

The complete source is [examples/redis/index.ts](../../examples/redis/index.ts).

Run the Redis integration tests against the same instance with:

```bash
npm run test:redis
```
