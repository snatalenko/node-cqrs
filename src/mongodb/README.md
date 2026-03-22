node-cqrs/mongodb
=================

MongoDB event storage for `node-cqrs`. Use this package when you need a durable, scalable event store backed by MongoDB with optimistic concurrency control and saga correlation support.

## mongoDbFactory

Register `mongoDbFactory` to provide the MongoDB `Db` instance used by the event storage. The factory is async, so it can load credentials or resolve connection settings before connecting.

```ts
import { MongoClient } from 'mongodb';

builder.registerInstance(async () => {
	const credentials = await loadCredentials();
	const client = new MongoClient(credentials.url);
	await client.connect();
	return client.db(credentials.dbName);
}, 'mongoDbFactory');
```

## MongoEventStorage

Use `MongoEventStorage` as the event store backend when you need persistence beyond in-memory storage in a multi-process or production setup. It implements `IEventStorageReader`, `IIdentifierProvider`, and `IDispatchPipelineProcessor`, so it covers all three roles the event store requires.

```ts
import { MongoEventStorage } from 'node-cqrs/mongodb';

builder.register(MongoEventStorage);
```

### Configuration

Register `mongoEventStorageConfig` to override defaults:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `collection` | `events` | MongoDB collection name for storing events. |

```ts
builder.registerInstance({ collection: 'domain_events' }, 'mongoEventStorageConfig');
builder.register(MongoEventStorage);
```

### Concurrency

`MongoEventStorage` uses MongoDB's unique index on `aggregateId + aggregateVersion` to detect concurrent writes. A conflicting write throws a `ConcurrencyError`, which the aggregate command handler catches and retries with a fresh rehydrate.

Note: `ignoreConcurrencyError` is not supported — passing it throws immediately.

### IDs

`getNewId()` returns a new MongoDB `ObjectId` hex string. These are used as event IDs throughout the pipeline.

## Examples

See [examples/mongodb/index.ts](../../examples/mongodb/index.ts) for a runnable example with DI container setup and manual wiring.
