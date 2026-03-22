node-cqrs/sqlite
================

SQLite helpers for `node-cqrs`. Use this package when you want durable event storage, SQLite-backed read models, or a custom SQL view that can restore itself from the event stream.

## viewModelSqliteDbFactory

Register `viewModelSqliteDbFactory` to provide the SQLite connection used by SQLite-backed storage and views. The factory can be async, which is useful when credentials or connection settings must be loaded before opening the database.

```ts
builder.registerInstance(async () => {
	const credentials = await loadCredentials();
	return createDb(credentials.filename);
}, 'viewModelSqliteDbFactory');
```

Alternatively, register a `Database` instance directly as `viewModelSqliteDb` when you already have an open connection (common in tests):

```ts
builder.registerInstance(createDb(':memory:'), 'viewModelSqliteDb');
```

## SqliteEventStorage

Use `SqliteEventStorage` when you want local persistence beyond in-memory storage. It is mainly for development and tests, not for multi-process setups. Register it in the container so the event store can append, read, and replay events from the same database.

```js
import { SqliteEventStorage } from 'node-cqrs/sqlite';

builder.registerInstance(() => createDb(':memory:'), 'viewModelSqliteDbFactory');
builder.register(SqliteEventStorage);
```

## AbstractSqliteObjectProjection<T>

Use `AbstractSqliteObjectProjection<T>` for the common case where each aggregate maps to one JSON-like record in SQLite. Define a table name and schema version, then update records from event handlers through `this.view`.

```ts
import { AbstractSqliteObjectProjection, type SqliteObjectView } from 'node-cqrs/sqlite';

builder.registerInstance(() => createDb(':memory:'), 'viewModelSqliteDbFactory');

// Register the projection and expose its `SqliteObjectView<UserRecord>` as `users`.
class UsersProjection extends AbstractSqliteObjectProjection<UserRecord> {
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

## AbstractSqliteView

Use `AbstractSqliteView` when your read model needs explicit tables, joins, indexes, or custom SQL queries. It gives you the same restore/checkpoint lifecycle as other views, while leaving schema design and queries under your control.

For relational views or custom SQL, extend `AbstractSqliteView` directly:

```ts
import { AbstractProjection } from 'node-cqrs';
import { AbstractSqliteView } from 'node-cqrs/sqlite';

class UsersByStatusView extends AbstractSqliteView {
	constructor({ viewModelSqliteDbFactory, logger }) {
		super({
			schemaVersion: '1',
			projectionName: 'UsersByStatusProjection',
			viewModelSqliteDbFactory,
			logger
		});
	}

	initialize(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS users_by_status (
				user_id TEXT PRIMARY KEY,
				username TEXT NOT NULL,
				status TEXT NOT NULL
			)
		`);
	}

	async upsertUser(userId: string, username: string, status: string) {
		await this.assertConnection();
		this.db!.prepare(`
			INSERT INTO users_by_status (user_id, username, status)
			VALUES (?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
				username = excluded.username,
				status = excluded.status
		`).run(userId, username, status);
	}

	async findByStatus(status: string) {
		await this.assertConnection();
		return this.db!.prepare(`
			SELECT user_id, username, status
			FROM users_by_status
			WHERE status = ?
			ORDER BY username
		`).all(status);
	}
}

class UsersByStatusProjection extends AbstractProjection<UsersByStatusView> {
	constructor({ viewModelSqliteDbFactory, logger }) {
		super({ logger });
		this.view = new UsersByStatusView({ viewModelSqliteDbFactory, logger });
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.upsertUser(String(event.aggregateId), event.payload.username, 'active');
	}
}

builder.registerInstance(() => createDb(':memory:'), 'viewModelSqliteDbFactory');
builder.registerProjection(UsersByStatusProjection, 'usersByStatus');
```

## Examples

Start with the runnable example below if you want to see the SQLite projection setup end to end, including container registration and querying the resulting view.

See [examples/sqlite/index.ts](../../examples/sqlite/index.ts) for a runnable example.
