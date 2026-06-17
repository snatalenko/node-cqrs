node-cqrs/postgresql
====================

## Overview

PostgreSQL-backed event storage and persistent views for `node-cqrs`. Use this package when aggregates and projections need durable storage with transaction-safe writes, restart-safe checkpoints, readiness gates, and distributed rebuild locking.

> **Experimental** - not yet validated in production. APIs may change in minor versions.

This module does not require a specific PostgreSQL client class. Pass any object with a `query(text, values)` method, such as a `pg.Pool` or `pg.Client`.

## Table of Contents

- [viewModelPostgresqlDbFactory](#viewmodelpostgresqldbfactory)
- [PostgreSQL event storage](#postgresql-event-storage)
  - [PostgresqlEventStorage](#postgresqleventstorage)
- [PostgreSQL views](#postgresql-views)
  - [AbstractPostgresqlObjectProjection](#abstractpostgresqlobjectprojection)
  - [PostgresqlObjectView](#postgresqlobjectview)
  - [AbstractPostgresqlView](#abstractpostgresqlview)
- [Lower-level building blocks](#lower-level-building-blocks)
  - [PostgresqlObjectStorage](#postgresqlobjectstorage)
  - [PostgresqlViewLocker](#postgresqlviewlocker)
  - [PostgresqlEventLocker](#postgresqleventlocker)
- [Examples](#examples)

## viewModelPostgresqlDbFactory

Register `viewModelPostgresqlDbFactory` to provide the PostgreSQL connection used by PostgreSQL-backed event storage, views, and lockers. The factory can be async, which is useful when credentials or connection settings must be loaded before connecting.

```ts
import { Pool } from 'pg';

builder.register(() => {
	let pool: Pool;
	return async () => {
		if (!pool)
			pool = new Pool({ connectionString: process.env.DATABASE_URL });

		return pool;
	};
}).as('viewModelPostgresqlDbFactory');
```

Alternatively, register a query-capable connection directly as `viewModelPostgresqlDb` when you already have one open:

```ts
builder.registerInstance(pool, 'viewModelPostgresqlDb');
```

## PostgreSQL event storage

### PostgresqlEventStorage

`PostgresqlEventStorage` implements event storage, event reads, generated ids, and dispatch pipeline processing. It stores events in insertion order, records saga origin references, and wraps each batch commit in a PostgreSQL transaction.

```ts
import { CqrsContainerBuilder } from 'node-cqrs';
import { PostgresqlEventStorage } from 'node-cqrs/postgresql';

const builder = new CqrsContainerBuilder();

builder.registerInstance(pool, 'viewModelPostgresqlDb');
builder.register(PostgresqlEventStorage).as('eventStorage');
builder.register(PostgresqlEventStorage).as('eventStorageReader');
builder.register(PostgresqlEventStorage).as('identifierProvider');
```

For aggregate concurrency, `PostgresqlEventStorage` enforces duplicate `(aggregateId, aggregateVersion)` detection with a partial unique index. Normal writes store `check_concurrency = true`; writes with `ignoreConcurrencyError: true` store `check_concurrency = false`, leaving them outside that unique index while still committing in the same transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `viewModelPostgresqlDb` | `PostgresqlConnection` | Either this or factory | Query-capable PostgreSQL connection |
| `viewModelPostgresqlDbFactory` | `() => Promise<PostgresqlConnection> \| PostgresqlConnection` | Either this or connection | Lazy factory for the connection |
| `postgresqlEventStorageConfig.eventsTableName` | `string` | No | Event table name; defaults to `PostgresqlEventStorage.EVENTS_TABLE` |
| `postgresqlEventStorageConfig.eventSagasTableName` | `string` | No | Saga reference table name; defaults to `PostgresqlEventStorage.EVENT_SAGAS_TABLE` |

## PostgreSQL views

The recommended way to build persistent object read models with PostgreSQL is to extend `AbstractPostgresqlObjectProjection`. It wires up object storage, schema-migration locking, and event checkpointing automatically.

### AbstractPostgresqlObjectProjection

Base class for PostgreSQL-backed object projections. Requires two static getters to be defined on the subclass:

```ts
import { AbstractPostgresqlObjectProjection } from 'node-cqrs/postgresql';
import type { IEvent } from 'node-cqrs';

type UserRecord = { username: string };

class UsersProjection extends AbstractPostgresqlObjectProjection<UserRecord> {

	static get tableName() { return 'users'; }
	static get schemaVersion() { return '1'; }

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.create(String(event.aggregateId), {
			username: event.payload!.username
		});
	}
}
```

| Static getter | Required | Description |
|---|---|---|
| `tableName` | Yes | Base name for the PostgreSQL object table |
| `schemaVersion` | Yes | Schema version; appended to table name as `${tableName}_${schemaVersion}` |

Register like any other projection:

```ts
builder.registerProjection(UsersProjection, 'usersView');
```

### PostgresqlObjectView

The composite view created by `AbstractPostgresqlObjectProjection`. Can also be instantiated directly for custom projection wiring.

```ts
import { PostgresqlObjectView } from 'node-cqrs/postgresql';

const view = new PostgresqlObjectView({
	viewModelPostgresqlDbFactory, // or viewModelPostgresqlDb
	projectionName: 'users',
	schemaVersion: '1',
	tableNamePrefix: 'users'      // table name: users_1
});
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableNamePrefix` | `string` | Yes | Prefix for the PostgreSQL object table |
| `projectionName` | `string` | Yes | Identifies the projection in lock rows |
| `schemaVersion` | `string` | Yes | Appended to `tableNamePrefix` to form the table name |
| `postgresqlObjectStorageMaxRetries` | `number` | No | Max retries for optimistic concurrency conflicts; defaults to `100` |
| `eventLockTtl` | `number` | No | Event lock TTL in ms; defaults to `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL` |
| `eventLockTableName` | `string` | No | Event lock table name; defaults to `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE` |
| `viewLockTtl` | `number` | No | Schema-migration lock TTL in ms; defaults to `PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL` |
| `viewLockTableName` | `string` | No | View lock table name; defaults to `PostgresqlViewLocker.DEFAULT_TABLE` |

`PostgresqlObjectView` implements both `IObjectStorage` and `IEventLocker`. Reads via `view.get()` wait for any in-progress schema migration to complete before returning, so consumers always see a fully rebuilt view.

`AbstractPostgresqlObjectProjection` runs runtime event projection in a PostgreSQL transaction. The event-processing claim, object view mutation, processed marker, and last-event checkpoint are committed together. With a `pg.Pool`, the adapter obtains one client via `pool.connect()` for the transaction and releases it afterwards.

### AbstractPostgresqlView

Use `AbstractPostgresqlView` when your read model needs explicit PostgreSQL tables, joins, indexes, or custom SQL queries. It composes `PostgresqlViewLocker` and `PostgresqlEventLocker`, giving your custom view the same restore/checkpoint lifecycle as other persistent views while leaving schema design and queries under your control.

```ts
import { AbstractProjection } from 'node-cqrs';
import { AbstractPostgresqlView } from 'node-cqrs/postgresql';

class UsersByStatusView extends AbstractPostgresqlView {
	constructor({ viewModelPostgresqlDbFactory, logger }) {
		super({
			schemaVersion: '1',
			projectionName: 'UsersByStatusProjection',
			viewModelPostgresqlDbFactory,
			logger
		});
	}

	async initialize(db) {
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
		await this.db!.query(`
			INSERT INTO users_by_status (user_id, username, status)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET
				username = excluded.username,
				status = excluded.status
		`, [userId, username, status]);
	}

	async findByStatus(status: string) {
		await this.assertConnection();
		const result = await this.db!.query(`
			SELECT user_id, username, status
			FROM users_by_status
			WHERE status = $1
			ORDER BY username
		`, [status]);

		return result.rows;
	}
}

class UsersByStatusProjection extends AbstractProjection<UsersByStatusView> {
	constructor({ viewModelPostgresqlDbFactory, logger }) {
		super({ logger });
		this.view = new UsersByStatusView({ viewModelPostgresqlDbFactory, logger });
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.upsertUser(event.aggregateId, event.payload.username, 'active');
	}
}

builder.registerProjection(UsersByStatusProjection, 'usersByStatus');
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `viewModelPostgresqlDb` | `PostgresqlConnection` | Either this or factory | Query-capable PostgreSQL connection |
| `viewModelPostgresqlDbFactory` | `() => Promise<PostgresqlConnection> \| PostgresqlConnection` | Either this or connection | Lazy factory for the connection |
| `projectionName` | `string` | Yes | Identifies the projection in lock rows |
| `schemaVersion` | `string` | Yes | Distinguishes projection schema ownership and checkpoints |
| `eventLockTtl` | `number` | No | Event lock TTL in ms; defaults to `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL` |
| `eventLockTableName` | `string` | No | Event lock table name; defaults to `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE` |
| `viewLockTtl` | `number` | No | Schema-migration lock TTL in ms; defaults to `PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL` |
| `viewLockTableName` | `string` | No | View lock table name; defaults to `PostgresqlViewLocker.DEFAULT_TABLE` |

`AbstractPostgresqlView` implements both `IViewLocker` and `IEventLocker`. Custom read methods should wait for readiness before returning user-facing data if they can be called during projection rebuilds:

```ts
async getUser(id: string) {
	if (!this.ready)
		await this.once('ready');

	await this.assertConnection();
	// query read model here
}
```

## Lower-level building blocks

Use these directly only when the composite view classes do not fit your projection wiring.

### PostgresqlObjectStorage

Key/value row store with optimistic concurrency. Stores records as `{ id, data, version }` rows, with `data` stored as `jsonb`.

```ts
import { PostgresqlObjectStorage } from 'node-cqrs/postgresql';

const storage = new PostgresqlObjectStorage({
	viewModelPostgresqlDbFactory,
	tableName: 'users_v1',
	maxRetries: 50          // optional; default 100
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `tableName` | `string` | Yes | - | PostgreSQL table name |
| `maxRetries` | `number` | No | `100` | Max retries for optimistic concurrency conflicts on `update` and `updateEnforcingNew` |

`create(id, data)` throws if a row with that `id` already exists.
`updateEnforcingNew(id, updater)` reads, applies `updater`, then writes with a version check; retries up to `maxRetries` on conflict; inserts if missing.

### PostgresqlViewLocker

Prevents multiple processes from rebuilding the same view concurrently when a projection switches to a new `schemaVersion`. The first process to acquire the lock performs the rebuild; others wait until the lock is released before reading the view. The lock is automatically prolonged at half the TTL interval while the rebuild is in progress.

```ts
import { PostgresqlViewLocker } from 'node-cqrs/postgresql';

const locker = new PostgresqlViewLocker({
	viewModelPostgresqlDbFactory,
	projectionName: 'users',
	schemaVersion: '1',
	viewLockTtl: 60_000,                 // optional
	viewLockTableName: 'my_view_locks'   // optional
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectionName` | `string` | Yes | - | Identifies the projection in lock rows |
| `schemaVersion` | `string` | Yes | - | Combined with `projectionName` to form the lock row primary key |
| `viewLockTtl` | `number` | No | `PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL` | Schema-migration lock TTL in ms |
| `viewLockTableName` | `string` | No | `PostgresqlViewLocker.DEFAULT_TABLE` | Table name for lock rows and last-event checkpoints |

**Mutable static defaults** - reassign to change the default for all instances:

```ts
PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL = 60_000;   // default: 120_000
PostgresqlViewLocker.DEFAULT_TABLE = 'my_view_locks';  // default: 'ncqrs_view_locks'
```

### PostgresqlEventLocker

Per-event deduplication and last-processed-event checkpoint. Prevents a projection from handling the same event twice across restarts.

```ts
import { PostgresqlEventLocker } from 'node-cqrs/postgresql';

const locker = new PostgresqlEventLocker({
	viewModelPostgresqlDbFactory,
	projectionName: 'users',
	schemaVersion: '1',
	eventLockTtl: 30_000,                  // optional
	eventLockTableName: 'my_event_locks',  // optional
	viewLockTableName: 'my_view_locks'     // optional
});
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectionName` | `string` | Yes | - | Identifies the projection in lock rows |
| `schemaVersion` | `string` | Yes | - | Combined with `projectionName` to form lock/checkpoint ownership |
| `eventLockTtl` | `number` | No | `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL` | TTL for in-progress event locks in ms; expired locks can be claimed by another process |
| `eventLockTableName` | `string` | No | `PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE` | Table name for event locks |
| `viewLockTableName` | `string` | No | `PostgresqlEventLocker.DEFAULT_VIEW_LOCK_TABLE` | Table name used to track the last-processed event per projection |

**Mutable static defaults** - reassign to change the default for all instances:

```ts
PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL = 30_000;             // default: 15_000
PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE = 'my_event_locks'; // default: 'ncqrs_event_locks'
PostgresqlEventLocker.DEFAULT_VIEW_LOCK_TABLE = 'my_view_locks';   // default: 'ncqrs_view_locks'
```

## Examples

See [examples/postgresql/index.ts](../../examples/postgresql/index.ts) for a runnable example using `PostgresqlEventStorage`, `pg.Pool`, and `AbstractPostgresqlObjectProjection`.
