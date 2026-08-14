node-cqrs/mongodb
=================

MongoDB support for `node-cqrs` provides:

- durable event storage for aggregates and sagas;
- document-oriented projection views;
- custom MongoDB views built with your own collections, indexes, and queries;
- coordination for projection restore and event processing across multiple application instances.

> **Experimental** - not yet validated in production. APIs may change in minor versions.

## Installation

Install the MongoDB driver alongside `node-cqrs`:

```bash
npm install node-cqrs mongodb
```

The adapter accepts MongoDB `Db` instances. The application owns the underlying `MongoClient` and should close
it during shutdown.

## Choose what you need

| Requirement | Use |
|---|---|
| Store and restore aggregate events | `MongoEventStorage` |
| Store a document-like or key/value read model | `AbstractMongoObjectProjection` |
| Build a read model with custom MongoDB collections and queries | `AbstractMongoView` with `AbstractProjection` |
| Use only optimistic document storage | `MongoObjectStorage` |
| Compose storage and locking manually | The lower-level APIs described under [Advanced APIs](#advanced-apis) |

Event storage and views can be used independently and may use the same database or separate databases.

## Database setup

For a connection established during application startup, register the event database factory and view database
directly:

```ts
import { MongoClient } from 'mongodb';
import { ContainerBuilder } from 'node-cqrs';

const client = new MongoClient(process.env.MONGODB_URL ?? 'mongodb://localhost:27017');
await client.connect();

const builder = new ContainerBuilder();
builder.registerInstance(client.db('application_events'), 'eventStorageMongoDb');
builder.registerInstance(client.db('application_views'), 'viewModelMongoDb');
```

Event storage accepts `eventStorageMongoDb` or `eventStorageMongoDbFactory`. Views accept `viewModelMongoDb` or
`viewModelMongoDbFactory`. Register factories when credentials must be resolved asynchronously or connections
should be opened lazily:

```ts
import type { IContainer } from 'node-cqrs';

type CredentialsStore = {
	getMongoConnectionString(): Promise<string> | string;
};

interface DatabaseContainer extends IContainer {
	credentialsStore: CredentialsStore;
}

const builder = new ContainerBuilder<DatabaseContainer>();
let client: MongoClient | undefined;

builder.register(container => async () => {
	if (!client) {
		const connectionString = await container.credentialsStore.getMongoConnectionString();
		client ??= new MongoClient(connectionString);
	}

	await client.connect();
	return client.db('application_events');
}, 'eventStorageMongoDbFactory');
```

The application can close the retained client with `await client?.close()` during shutdown. Use the same pattern
with `viewModelMongoDbFactory` for a lazily connected view database. Both factories may return databases from
the same `MongoClient`, but separate dependency names allow event and view data to use different databases or
clusters. Concurrent `connect()` calls for the shared client wait on the MongoDB driver's connection lock.

## Event storage

`MongoEventStorage` stores events, preserves saga origin references, and generates MongoDB `ObjectId`-based event
identifiers.

```ts
import { EventIdAugmentor } from 'node-cqrs';
import { MongoEventStorage } from 'node-cqrs/mongodb';

builder.register(MongoEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
```

`ContainerBuilder` detects the roles implemented by `MongoEventStorage` and uses it as the event writer, event
reader, and identifier provider.

Aggregate versions are checked optimistically through a unique index on `aggregateId` and `aggregateVersion`.
If two commands append the same aggregate version, one succeeds and the other throws `ConcurrencyError`.
`ignoreConcurrencyError` is not supported.

Event batches do not use MongoDB transactions. If an insert fails, the adapter removes events from that batch
that it already inserted. Process termination during the batch can still leave a partial write.

The default event collection is `events`. To use a different name:

```ts
builder.registerInstance({ collection: 'domain_events' }, 'mongoEventStorageConfig');
```

## Document views

Use `AbstractMongoObjectProjection` when each read-model record is naturally addressed by id and stored as one
MongoDB document.

```ts
import type { IEvent } from 'node-cqrs';
import { AbstractMongoObjectProjection } from 'node-cqrs/mongodb';

type UserRecord = {
	username: string;
};

class UsersProjection extends AbstractMongoObjectProjection<UserRecord> {
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

Expose the view through the container and wait for restoration before serving reads:

```ts
import { ContainerBuilder, type IContainer } from 'node-cqrs';
import type { MongoObjectView } from 'node-cqrs/mongodb';

interface AppContainer extends IContainer {
	usersView: MongoObjectView<UserRecord>;
}

const builder = new ContainerBuilder<AppContainer>();
builder.registerInstance(client.db('application_views'), 'viewModelMongoDb');
builder.registerProjection(UsersProjection, 'usersView');

const { usersView, restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);

const user = await usersView.get(userId);
```

Persistent view checkpoints require every event to have an `id`. Register `EventIdAugmentor` when the selected
event-storage pipeline does not assign ids before projection delivery.

The physical collection is `${tableName}_${schemaVersion}`; the example uses `users_1`. Documents contain `_id`,
`data`, and a version used for optimistic updates. Concurrent events that update the same record are retried when
the version changes. Update callbacks may therefore run more than once and must not perform external side
effects.

## Custom views

Use `AbstractMongoView` when a read model needs its own document shape, indexes, aggregation pipelines, or query
methods. It provides restore locking, event deduplication, and checkpoints, while the subclass owns its MongoDB
collections.

```ts
import type { Collection, Db } from 'mongodb';
import { AbstractProjection, type IContainer, type IEvent, type Identifier } from 'node-cqrs';
import { AbstractMongoView } from 'node-cqrs/mongodb';

type MongoDependencies = Pick<
	IContainer,
	'viewModelMongoDb' | 'viewModelMongoDbFactory' | 'logger'
>;

type UserStatusDocument = {
	userId: Identifier;
	username: string;
	status: string;
};

class UsersByStatusView extends AbstractMongoView {
	#users: Collection<UserStatusDocument> | undefined;

	constructor(options: MongoDependencies) {
		super({
			...options,
			projectionName: 'UsersByStatusProjection',
			schemaVersion: '1'
		});
	}

	protected override async initialize(db: Db) {
		this.#users = db.collection<UserStatusDocument>('users_by_status_1');
		await this.#users.createIndex({ status: 1, username: 1 });
	}

	async upsertUser(userId: Identifier, username: string, status: string) {
		await this.assertConnection();
		await this.#users!.updateOne(
			{ userId },
			{ $set: { username, status } },
			{ upsert: true }
		);
	}

	async findByStatus(status: string) {
		if (!this.ready)
			await this.once('ready');

		await this.assertConnection();
		return this.#users!.find({ status }).sort({ username: 1 }).toArray();
	}
}

class UsersByStatusProjection extends AbstractProjection<UsersByStatusView> {
	constructor(options: MongoDependencies) {
		super({ logger: options.logger });
		this.view = new UsersByStatusView(options);
	}

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.upsertUser(event.aggregateId!, event.payload!.username, 'active');
	}
}
```

## Runtime processing

MongoDB views coordinate event handling across application instances. A projection first claims an event, then
runs its handler, marks the event as processed, and saves its checkpoint. If another instance receives the same
event concurrently, it cannot claim it and skips that delivery.

These steps are separate MongoDB operations and are not wrapped in a transaction. If processing stops after the
view mutation but before the processed marker, a later retry can apply the handler again. If it stops before the
mutation completes, the event can be claimed after the event lock TTL, but only when it is delivered or restored
again; there is no background retry scheduler. Projection handlers should be retryable, and the application must
decide how failed runtime deliveries are retried.

## Restore and schema versions

On startup, a projection resumes after its last saved checkpoint. A distributed view lock ensures that only one
application instance restores a given projection and schema version at a time. The lock is prolonged while held;
other instances wait and then continue from the resulting checkpoint.

Change `schemaVersion` when the shape or meaning of a read model changes and its events must be replayed. Object
views write to a new versioned collection automatically. Custom views own their collection naming and migration
strategy.

Wait for `restorePromises` before serving requests that depend on projections. `MongoObjectView.get()` and custom
read methods that follow the readiness pattern above also wait for an in-progress local restore.

## Operations

- Collections and indexes are initialized lazily on first use. The MongoDB user must be able to create indexes
  and read and write the configured collections.
- The adapter does not close a supplied view database. Retain the owning `MongoClient` and close it during
  application shutdown.
- Event processing locks are persistent deduplication records, not MongoDB TTL documents. Plan storage capacity
  for one lock document per event and projection schema version.
- Use distinct collection names when multiple applications share a database.

## Advanced APIs

Most consumers do not need to construct these classes directly:

| Class | Use directly when |
|---|---|
| `MongoObjectView` | A custom projection needs the standard object storage and locking behavior |
| `MongoObjectStorage` | Only MongoDB-backed key/value storage is needed |
| `MongoViewLocker` | A custom component needs distributed restore or migration locking |
| `MongoEventLocker` | A custom projection needs event deduplication and checkpoints |

The default restore lock TTL is 120 seconds and is prolonged automatically. The default event-processing lock
TTL is 15 seconds. Collection names and TTLs can be supplied when constructing views or lockers directly.
`AbstractMongoObjectProjection` uses the mutable static defaults on `MongoViewLocker` and `MongoEventLocker`.

## Run locally

Start MongoDB:

```bash
docker run --name node-cqrs-mongodb -p 27017:27017 -d mongo:7
```

Run the event-storage and document-view examples:

```bash
npm run example:mongodb-eventstore
npm run example:mongodb-views
```

The complete sources are [examples/mongodb-eventstore/index.ts](../../examples/mongodb-eventstore/index.ts) and
[examples/mongodb-views/index.ts](../../examples/mongodb-views/index.ts).

Run the MongoDB integration tests against the same instance with:

```bash
npm run test:mongodb
```
