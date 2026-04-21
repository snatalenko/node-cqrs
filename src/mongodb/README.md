node-cqrs/mongodb
=================

MongoDB event storage and persistent views for `node-cqrs`.

> **Experimental** - not yet validated in production. APIs may change in minor versions.

## Table of Contents

- [MongoEventStorage](#mongoeventstorage)
- [MongoDB views](#mongodb-views)
  - [AbstractMongoObjectProjection](#abstractmongoobjectprojection)
  - [MongoObjectView](#mongoobjectview)
  - [AbstractMongoView](#abstractmongoview)
- [Lower-level building blocks](#lower-level-building-blocks)
  - [MongoObjectStorage](#mongoobjectstorage)
  - [MongoViewLocker](#mongoviewlocker)
  - [MongoEventLocker](#mongoeventlocker)


## MongoEventStorage

Implements `IEventStorageReader`, `IIdentifierProvider`, and `IDispatchPipelineProcessor`. Covers all three roles the event store pipeline requires.

Register `mongoDbFactory` to provide the `Db` instance, then register `MongoEventStorage`:

```ts
import { MongoClient } from 'mongodb';
import { MongoEventStorage } from 'node-cqrs/mongodb';

builder.registerInstance(async () => {
	const client = new MongoClient('mongodb://localhost:27017');
	await client.connect();
	return client.db('my_event_store');
}, 'mongoDbFactory');

builder.register(MongoEventStorage);
```

### Configuration

Register `mongoEventStorageConfig` to override defaults:

| Parameter | Default | Description |
|---|---|---|
| `collection` | `'events'` | Collection name for storing events |

```ts
builder.registerInstance({ collection: 'domain_events' }, 'mongoEventStorageConfig');
builder.register(MongoEventStorage);
```

### Concurrency

`MongoEventStorage` uses a unique index on `{ aggregateId, aggregateVersion }` to detect concurrent writes. A conflicting write throws a `ConcurrencyError`, which the aggregate command handler catches and retries with a fresh rehydrate.

`ignoreConcurrencyError` is not supported - passing it throws immediately.

### IDs

`getNewId()` returns a new MongoDB `ObjectId` hex string used as event IDs throughout the pipeline.

See [examples/mongodb-eventstore/index.ts](../../examples/mongodb-eventstore/index.ts) for a runnable example.


## MongoDB views

The recommended way to build persistent read models with MongoDB is to extend `AbstractMongoObjectProjection`. It wires up object storage, schema-migration locking, and event checkpointing automatically.

Register `viewModelMongoDbFactory` (async factory) or `viewModelMongoDb` (a pre-connected `Db` instance) to provide the database connection used by all view classes:

```ts
import { MongoClient } from 'mongodb';

builder.register(() => {
	let client: MongoClient;
	return async () => {
		if (!client) {
			client = new MongoClient('mongodb://localhost:27017');
			await client.connect();
		}
		return client.db('my_view_store');
	};
}).as('viewModelMongoDbFactory');
```

Event storage and view model storage use separate connection registrations so they can point to different databases, though both can point to the same one.

### AbstractMongoObjectProjection

Base class for MongoDB-backed object projections. Requires two static getters to be defined on the subclass:

```ts
import { AbstractMongoObjectProjection } from 'node-cqrs/mongodb';
import type { IEvent } from 'node-cqrs';

class UsersProjection extends AbstractMongoObjectProjection<{ username: string }> {

	static get tableName() { return 'users'; }
	static get schemaVersion() { return '1'; }

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.create(event.aggregateId as string, {
			username: event.payload.username
		});
	}
}
```

| Static getter | Required | Description |
|---|---|---|
| `tableName` | Yes | Base name for the MongoDB collection |
| `schemaVersion` | Yes | Schema version; appended to collection name as `${tableName}_${schemaVersion}` |

Register like any other projection:

```ts
builder.register(UsersProjection, 'usersView');
```

### MongoObjectView

The composite view created by `AbstractMongoObjectProjection`. Can also be instantiated directly for custom projection wiring.

```ts
import { MongoObjectView } from 'node-cqrs/mongodb';

const view = new MongoObjectView({
	viewModelMongoDbFactory,   // or viewModelMongoDb
	projectionName: 'users',
	schemaVersion: '1',
	tableNamePrefix: 'users'   // collection name: users_1
});
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableNamePrefix` | `string` | Yes | Prefix for the MongoDB collection name |
| `projectionName` | `string` | Yes | Identifies the projection in lock documents |
| `schemaVersion` | `string` | Yes | Appended to `tableNamePrefix` to form the collection name |
| `eventLockTtl` | `number` | No | Event lock TTL in ms; defaults to `MongoEventLocker.DEFAULT_EVENT_LOCK_TTL` |
| `eventLocksCollection` | `string` | No | Event locks collection name; defaults to `MongoEventLocker.DEFAULT_EVENT_LOCKS_COLLECTION` |
| `viewLockTtl` | `number` | No | Schema-migration lock TTL in ms; defaults to `MongoViewLocker.DEFAULT_VIEW_LOCK_TTL` |
| `viewLocksCollection` | `string` | No | View locks collection name; defaults to `MongoViewLocker.DEFAULT_COLLECTION` |

`MongoObjectView` implements both `IObjectStorage` and `IEventLocker`. Reads via `view.get()` wait for any in-progress schema migration to complete before returning, so consumers always see a fully rebuilt view.

### AbstractMongoView

Lower-level base class used internally by `MongoObjectView`. Composes `MongoViewLocker` and `MongoEventLocker` without adding object storage. Extend this when you need custom storage logic but still want schema-migration locking and event checkpointing:

```ts
import { AbstractMongoView } from 'node-cqrs/mongodb';

class MyCustomView extends AbstractMongoView {
	// this.viewLocker - MongoViewLocker instance
	// this.eventLocker - MongoEventLocker instance
}
```

Accepts the same parameters as `MongoObjectView` minus `tableNamePrefix`.


## Lower-level building blocks

Use these directly only when the composite view classes don't fit your use case.

### MongoObjectStorage

Key/value document store with optimistic concurrency. Stores records as `{ _id, data, version }` documents.

```ts
import { MongoObjectStorage } from 'node-cqrs/mongodb';

const storage = new MongoObjectStorage({
	viewModelMongoDbFactory,
	tableName: 'users_v1',
	maxRetries: 50          // optional; default 100
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `tableName` | `string` | Yes | - | MongoDB collection name |
| `maxRetries` | `number` | No | `100` | Max retries for optimistic concurrency conflicts on `updateEnforcingNew` |

`create(id, data)` throws if a document with that `id` already exists.
`updateEnforcingNew(id, updater)` reads, applies `updater`, then writes with a version check; retries up to `maxRetries` on conflict; inserts if missing.

### MongoViewLocker

Prevents multiple processes from rebuilding the same view concurrently when a projection switches to a new `schemaVersion`. The first process to acquire the lock performs the rebuild; others wait until the lock is released before reading the view. The lock is automatically prolonged at half the TTL interval while the rebuild is in progress.

```ts
import { MongoViewLocker } from 'node-cqrs/mongodb';

const locker = new MongoViewLocker({
	viewModelMongoDbFactory,
	projectionName: 'users',
	schemaVersion: '1',
	viewLockTtl: 60_000,                         // optional
	viewLocksCollection: 'my_view_locks'          // optional
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectionName` | `string` | Yes | - | Identifies the projection in lock documents |
| `schemaVersion` | `string` | Yes | - | Combined with `projectionName` to form the lock document `_id` |
| `viewLockTtl` | `number` | No | `MongoViewLocker.DEFAULT_VIEW_LOCK_TTL` | Schema-migration lock TTL in ms |
| `viewLocksCollection` | `string` | No | `MongoViewLocker.DEFAULT_COLLECTION` | Collection name for lock documents |

**Mutable static defaults** - reassign to change the default for all instances:

```ts
MongoViewLocker.DEFAULT_VIEW_LOCK_TTL = 60_000;     // default: 120_000
MongoViewLocker.DEFAULT_COLLECTION = 'my_locks';    // default: 'ncqrs_view_locks'
```

### MongoEventLocker

Per-event deduplication and last-processed-event checkpoint. Prevents a projection from handling the same event twice across restarts.

```ts
import { MongoEventLocker } from 'node-cqrs/mongodb';

const locker = new MongoEventLocker({
	viewModelMongoDbFactory,
	projectionName: 'users',
	schemaVersion: '1',
	eventLockTtl: 30_000,                          // optional
	eventLocksCollection: 'my_event_locks',        // optional
	viewLocksCollection: 'my_view_locks'           // optional
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectionName` | `string` | Yes | - | Identifies the projection in lock documents |
| `schemaVersion` | `string` | Yes | - | Combined with `projectionName` to form the lock document `_id` |
| `eventLockTtl` | `number` | No | `MongoEventLocker.DEFAULT_EVENT_LOCK_TTL` | TTL for in-progress event locks in ms; expired locks can be claimed by another process |
| `eventLocksCollection` | `string` | No | `MongoEventLocker.DEFAULT_EVENT_LOCKS_COLLECTION` | Collection name for event lock documents |
| `viewLocksCollection` | `string` | No | `MongoEventLocker.DEFAULT_VIEW_LOCKS_COLLECTION` | Collection name used to track the last-processed event per projection |

**Mutable static defaults** - reassign to change the default for all instances:

```ts
MongoEventLocker.DEFAULT_EVENT_LOCK_TTL = 30_000;                    // default: 15_000
MongoEventLocker.DEFAULT_EVENT_LOCKS_COLLECTION = 'my_event_locks';  // default: 'ncqrs_event_locks'
MongoEventLocker.DEFAULT_VIEW_LOCKS_COLLECTION = 'my_view_locks';    // default: 'ncqrs_view_locks'
```

## Examples

- [examples/mongodb-eventstore/index.ts](../../examples/mongodb-eventstore/index.ts) - `MongoEventStorage` with DI container setup and manual wiring
- [examples/mongodb-views/index.ts](../../examples/mongodb-views/index.ts) - `AbstractMongoObjectProjection` with object storage and distributed locking
