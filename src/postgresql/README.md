node-cqrs/postgresql
====================

PostgreSQL support for `node-cqrs` provides:

- durable event storage for aggregates and sagas;
- relational views built with your own tables, indexes, and queries;
- optional document-like object views stored as `jsonb`;
- coordination for projection restore and event processing across multiple application instances.

> **Experimental** - not yet validated in production. APIs may change in minor versions.

## Installation

Install the PostgreSQL driver alongside `node-cqrs`:

```bash
npm install node-cqrs pg
```

A shared `pg.Pool` is recommended. The PostgreSQL adapter acquires a dedicated client from the pool when it
starts a transaction and releases that client afterwards.

```ts
import { Pool } from 'pg';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});
```

The application owns the pool and must close it during shutdown with `pool.end()`.

## Choose what you need

| Requirement | Use |
|---|---|
| Store and restore aggregate events | `PostgresqlEventStorage` |
| Build a relational read model with custom SQL | `AbstractPostgresqlView` and `AbstractPostgresqlProjection` |
| Store a document-like or key/value read model as `jsonb` | `AbstractPostgresqlObjectProjection` |
| Compose storage and locking manually | The lower-level APIs described under [Advanced APIs](#advanced-apis) |

Event storage and views can be used independently. Choose the view representation that fits the read model:
relational tables for SQL-oriented data, or an object view for records naturally addressed
by id and stored as a single JSON document.

## Container setup

Register an existing pool directly:

```ts
import { ContainerBuilder, EventIdAugmentor, type IContainer } from 'node-cqrs';
import { PostgresqlEventStorage } from 'node-cqrs/postgresql';

const builder = new ContainerBuilder();

builder.registerInstance(pool, 'eventStoragePostgresqlDb');
builder.registerInstance(pool, 'viewModelPostgresqlDb');
builder.register(PostgresqlEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
```

`ContainerBuilder` detects the roles implemented by `PostgresqlEventStorage` and uses it as the event writer,
event reader, and identifier provider. `EventIdAugmentor` assigns the event ids required by persistent storage
and projection checkpoints.

Event storage accepts `eventStoragePostgresqlDb` or `eventStoragePostgresqlDbFactory`. Views accept
`viewModelPostgresqlDb` or `viewModelPostgresqlDbFactory`. The separate names allow event and view data to use
different databases while still supporting one shared pool.

Use factories when credentials or connection settings come from another container dependency. The named
`container` argument makes that dependency resolution explicit. Cache the pool in a shared provider, then map
both adapter roles to it:

```ts
interface DatabaseContainer extends IContainer {
	postgresqlConnectionStringProvider: () => Promise<string> | string;
	postgresqlDbFactory: () => Promise<Pool>;
}

const builder = new ContainerBuilder<DatabaseContainer>();
let pool: Pool | undefined;

builder.registerInstance(
	() => secretProvider.get('POSTGRESQL_CONNECTION_STRING'),
	'postgresqlConnectionStringProvider'
);

builder.register(container => {
	return async () => {
		if (pool)
			return pool;

		const connectionString = await container.postgresqlConnectionStringProvider();
		pool ??= new Pool({ connectionString });
		return pool;
	};
}, 'postgresqlDbFactory');

builder.register(container => () => container.postgresqlDbFactory(), 'eventStoragePostgresqlDbFactory');
builder.register(container => () => container.postgresqlDbFactory(), 'viewModelPostgresqlDbFactory');
```

The application can close the retained pool with `await pool?.end()` during shutdown.

## Event storage

`PostgresqlEventStorage` stores events in insertion order and preserves saga origin references. Each batch is
committed in one transaction: either all events and saga references are written, or none are.

Register it with the container builder:

```ts
builder.register(PostgresqlEventStorage);
```

Aggregate versions are checked optimistically. If two commands try to append the same aggregate version, one
commit succeeds and the other throws `ConcurrencyError`. Passing `ignoreConcurrencyError: true` opts that write
out of the aggregate-version uniqueness check.

The default event tables are `tbl_events` and `tbl_event_sagas`. To use different names:

```ts
builder.registerInstance({
	eventsTableName: 'application_events',
	eventSagasTableName: 'application_event_sagas'
}, 'postgresqlEventStorageConfig');
```

## JSON object views

Use `AbstractPostgresqlObjectProjection` to maintain a view where each record is naturally addressed by id and
can be stored as one `jsonb` document. Define a table name and schema version, then handle events using the
normal projection method naming convention.

```ts
import type { IEvent } from 'node-cqrs';
import { AbstractPostgresqlObjectProjection } from 'node-cqrs/postgresql';

type UserRecord = {
	username: string;
};

class UsersProjection extends AbstractPostgresqlObjectProjection<UserRecord> {
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

Expose the view through the container:

```ts
import type { IContainer } from 'node-cqrs';
import type { PostgresqlObjectView } from 'node-cqrs/postgresql';

interface AppContainer extends IContainer {
	usersView: PostgresqlObjectView<UserRecord>;
}

const builder = new ContainerBuilder<AppContainer>();
builder.registerInstance(pool, 'viewModelPostgresqlDb');
builder.registerInstance(pool, 'eventStoragePostgresqlDb');
builder.register(PostgresqlEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
builder.registerProjection(UsersProjection, 'usersView');

const { usersView, restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);

const user = await usersView.get(userId);
```

The physical object table is `${tableName}_${schemaVersion}`; the example uses `users_1`. Its rows contain an
id, JSON data, and a version used for optimistic updates.

### Runtime processing

`AbstractPostgresqlObjectProjection` inherits transactional runtime processing from
`AbstractPostgresqlProjection`. For each event received at runtime, it commits these operations in one PostgreSQL
transaction:

1. Claim the event for this projection.
2. Modify the object view.
3. Mark the event as processed.
4. Save the last-event checkpoint.

When two application instances receive the same event, one transaction processes it and the other skips it. If
the first transaction fails, its claim and view changes are rolled back, allowing the waiting instance to process
the event. Different events that update the same object use optimistic retries to avoid lost updates.

### Restore and schema versions

On startup, the projection resumes after its last saved checkpoint. Restore uses a distributed view lock, so only
one application instance rebuilds a given projection and schema version at a time. Other instances wait for that
view to become ready.

Change `schemaVersion` when the shape or meaning of a read model changes and its events must be replayed into a
new object table. Restore is protected by the view lock; it does not open one transaction per replayed event.

Wait for `restorePromises` before serving requests that depend on projections. `PostgresqlObjectView.get()` also
waits when a restore is currently in progress.

## Relational views

Use `AbstractPostgresqlView` to model a read model with PostgreSQL tables, joins, indexes, constraints, and
query-specific columns. Pair it with `AbstractPostgresqlProjection` for transactional runtime event processing.
The view provides restore locking, event deduplication, and checkpoints, while your subclass owns its schema and
queries.

```ts
import type { IContainer } from 'node-cqrs';
import type { PostgresqlConnection } from 'node-cqrs/postgresql';
import { AbstractPostgresqlView } from 'node-cqrs/postgresql';

type PostgresqlDependencies = Pick<
	IContainer,
	'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory' | 'logger'
>;

class UsersByStatusView extends AbstractPostgresqlView {
	constructor(options: PostgresqlDependencies) {
		super({
			...options,
			projectionName: 'UsersByStatusProjection',
			schemaVersion: '1'
		});
	}

	protected override async initialize(db: PostgresqlConnection) {
		await db.query(`
			CREATE TABLE IF NOT EXISTS users_by_status (
				user_id text PRIMARY KEY,
				username text NOT NULL,
				status text NOT NULL
			)
		`);
	}

	async upsertUser(userId: string, username: string, status: string) {
		await this.assertConnection();
		await this.connection.query(`
			INSERT INTO users_by_status (user_id, username, status)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET
				username = excluded.username,
				status = excluded.status
		`, [userId, username, status]);
	}
}
```

Extend `AbstractPostgresqlProjection` and assign the relational view in the projection constructor. The base class
commits the event claim, custom SQL, processed marker, and checkpoint atomically at runtime:

```ts
import type { IEvent } from 'node-cqrs';
import { AbstractPostgresqlProjection } from 'node-cqrs/postgresql';

class UsersByStatusProjection extends AbstractPostgresqlProjection<UsersByStatusView> {
	constructor(options: PostgresqlDependencies) {
		super({ logger: options.logger });
		this.view = new UsersByStatusView(options);
	}

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.upsertUser(
			String(event.aggregateId),
			event.payload!.username,
			'active'
		);
	}
}
```

Queries participating in that transaction must use `this.connection`, as in `upsertUser()`, rather than the base
`db` field. Custom read methods should wait for readiness before returning data:

```ts
async findByStatus(status: string) {
	if (!this.ready)
		await this.once('ready');

	await this.assertConnection();
	return (await this.connection.query(
		'SELECT * FROM users_by_status WHERE status = $1',
		[status]
	)).rows;
}
```

## Configuration

| Option | Default | Purpose |
|---|---|---|
| `eventStoragePostgresqlDb` | - | Existing connection or `pg.Pool` used by event storage |
| `eventStoragePostgresqlDbFactory` | - | Lazy event-storage connection or pool factory |
| `viewModelPostgresqlDb` | - | An existing PostgreSQL connection or `pg.Pool` |
| `viewModelPostgresqlDbFactory` | - | Lazy connection or pool factory; use instead of `viewModelPostgresqlDb` |
| `postgresqlEventStorageConfig.eventsTableName` | `tbl_events` | Event table name |
| `postgresqlEventStorageConfig.eventSagasTableName` | `tbl_event_sagas` | Saga reference table name |
| `postgresqlObjectStorageMaxRetries` | `100` | Retries when concurrent events update the same object |
| `eventLockTtl` | `15_000` ms | Time after which an abandoned event claim can be reclaimed |
| `eventLockTableName` | `ncqrs_event_locks` | Event processing table name |
| `viewLockTtl` | `120_000` ms | Restore lock duration; prolonged automatically while held |
| `viewLockTableName` | `ncqrs_view_locks` | Restore lock and checkpoint table name |

Connection options and event-storage configuration are normally registered in the container. Lock options can be
passed from a projection constructor to `AbstractPostgresqlObjectProjection` or `AbstractPostgresqlView`.

## Operations

- Tables and indexes are created lazily on first use with `CREATE TABLE IF NOT EXISTS` and
  `CREATE INDEX IF NOT EXISTS`.
- The database role must be able to create those objects and read and write their tables.
- Prefer `pg.Pool` for concurrent applications. A shared `pg.Client` is only appropriate when database work is
  serialized by the application.
- Table names are quoted as identifiers. Use separate configuration when multiple applications share a database.
- The adapter does not close the supplied connection or pool.

## Advanced APIs

Most consumers do not need to construct these classes directly:

| Class | Use directly when |
|---|---|
| `PostgresqlObjectView` | A custom projection needs the standard object storage and locking behavior |
| `PostgresqlObjectStorage` | Only PostgreSQL-backed key/value storage is needed |
| `PostgresqlViewLocker` | A custom component needs distributed restore or migration locking |
| `PostgresqlEventLocker` | A custom projection needs event deduplication and checkpoints |

`PostgresqlViewLocker` and `PostgresqlEventLocker` expose mutable static defaults for global table names and TTLs.
Prefer per-instance options when applications share a process or database.

## Run locally

Start PostgreSQL:

```bash
docker run --name node-cqrs-postgres \
	-e POSTGRES_PASSWORD=postgres \
	-p 5432:5432 \
	-d postgres:16
```

A runnable example combining the event store with a JSON object view is included:

```bash
npm run example:postgresql
```

Set `DATABASE_URL` to use a different local connection. The complete source is
[examples/postgresql/index.ts](../../examples/postgresql/index.ts).

Run the PostgreSQL integration tests against the same instance with:

```bash
npm run test:postgresql
```
