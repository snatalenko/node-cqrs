node-cqrs/sqlite
================

SQLite support for `node-cqrs` provides:

- embedded event storage for aggregates and sagas;
- relational views built with your own tables, indexes, and queries;
- optional document-like object views stored as JSON;
- asynchronous reads through a dedicated worker thread;
- projection restoration and event-processing checkpoints.

The module is intended for embedded, single-process applications. Use a server database when several application
processes need to write the same event store or views concurrently.

## Installation

Install the SQLite driver alongside `node-cqrs`:

```bash
npm install node-cqrs better-sqlite3
```

When database encryption is required, the compatible
[`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) driver can be
used instead:

```bash
npm install node-cqrs better-sqlite3-multiple-ciphers
```

## Choose what you need

| Requirement | Use |
|---|---|
| Store and restore aggregate events | `SqliteEventStorage` |
| Build a relational read model with custom SQL | `AbstractSqliteView` |
| Store a document-like or key/value read model | `AbstractSqliteObjectProjection` |
| Run SQLite reads outside the main thread | `SqliteWorkerProxy` from `node-cqrs/sqlite-workers` |
| Compose storage and checkpointing manually | The lower-level APIs described under [Advanced APIs](#advanced-apis) |

Event storage and views can be used independently. Choose relational tables for SQL-oriented data, or an object
view for records naturally addressed by id and stored as one JSON document.

## Database setup

For most applications, create one database connection and register it directly:

```ts
import createDb from 'better-sqlite3';
import { ContainerBuilder } from 'node-cqrs';

const db = createDb('application.sqlite');
const builder = new ContainerBuilder();

builder.registerInstance(db, 'viewModelSqliteDb');
```

The application owns the connection and must close it during shutdown with `db.close()`.

An encrypted database is an important use case for `viewModelSqliteDbFactory`: the filename and encryption key
can be resolved asynchronously from an external credentials store before the connection is returned. Cache
the connection so every accessor receives the same application-owned database:

```ts
import createEncryptedDb from 'better-sqlite3-multiple-ciphers';
import { ContainerBuilder, type IContainer } from 'node-cqrs';

type EncryptedSqliteCredentials = {
	filename: string;
	encryptionKey: string;
};

type CredentialsStore = {
	getSqliteCredentials(): Promise<EncryptedSqliteCredentials>;
};

interface DatabaseContainer extends IContainer {
	credentialsStore: CredentialsStore;
}

const builder = new ContainerBuilder<DatabaseContainer>();
let db: ReturnType<typeof createEncryptedDb> | undefined;

builder.register(container => async () => {
	if (db)
		return db;

	const { filename, encryptionKey } = await container.credentialsStore.getSqliteCredentials();
	const encryptedDb = createEncryptedDb(filename);
	encryptedDb.key(Buffer.from(encryptionKey, 'utf8'));
	db = encryptedDb;
	return db;
}, 'viewModelSqliteDbFactory');
```

Keep the encryption key outside application configuration files and apply it before the adapter executes any
queries. The application still owns and must close the encrypted connection.

## Event storage

`SqliteEventStorage` stores events in insertion order and preserves saga origin references. Each event batch and
its saga references are committed in one SQLite transaction.

Register the storage and the event-id pipeline processor:

```ts
import { EventIdAugmentor } from 'node-cqrs';
import { SqliteEventStorage } from 'node-cqrs/sqlite';

builder.register(SqliteEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
```

Aggregate versions are checked optimistically. If two writes contain the same aggregate version,
`SqliteEventStorage` throws `ConcurrencyError`. Passing `ignoreConcurrencyError: true` skips that check.

The event store creates `tbl_events`, `tbl_event_sagas`, and their indexes automatically.

## Relational views

Use `AbstractSqliteView` when a read model needs relational tables, joins, indexes, constraints, or query-specific
columns. The view provides restoration locking, event deduplication, and checkpoints, while your subclass owns
its schema and queries.

```ts
import type { Database } from 'better-sqlite3';
import { AbstractProjection, ContainerBuilder, type IContainer, type IEvent } from 'node-cqrs';
import { AbstractSqliteView } from 'node-cqrs/sqlite';

type SqliteDependencies = Pick<
	IContainer,
	'viewModelSqliteDb' | 'viewModelSqliteDbFactory' | 'logger'
>;

class UsersByStatusView extends AbstractSqliteView {
	constructor(options: SqliteDependencies) {
		super({
			...options,
			projectionName: 'UsersByStatusProjection',
			schemaVersion: '1'
		});
	}

	protected override initialize(db: Database) {
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
		if (!this.ready)
			await this.once('ready');

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
	constructor(options: SqliteDependencies) {
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

interface RelationalContainer extends IContainer {
	usersByStatus: UsersByStatusView;
}

const builder = new ContainerBuilder<RelationalContainer>();
builder.registerInstance(db, 'viewModelSqliteDb');
builder.registerProjection(UsersByStatusProjection, 'usersByStatus');
```

SQLite views do not currently wrap the event claim, view mutation, processed marker, and checkpoint in one
transaction. Handler failures are propagated to the application, which is responsible for deciding whether and
how to retry the event.

## JSON object views

Use `AbstractSqliteObjectProjection` when each read-model record is naturally addressed by id and can be stored
as one JSON document.

```ts
import { ContainerBuilder, type IContainer, type IEvent } from 'node-cqrs';
import { AbstractSqliteObjectProjection, type SqliteObjectView } from 'node-cqrs/sqlite';

type UserRecord = {
	username: string;
};

class UsersProjection extends AbstractSqliteObjectProjection<UserRecord> {
	static override get tableName() {
		return 'users';
	}

	static override get schemaVersion() {
		return '1';
	}

	async userCreated(event: IEvent<{ username: string }>) {
		await this.view.updateEnforcingNew(event.aggregateId!, () => ({
			username: event.payload!.username
		}));
	}
}

interface ObjectViewContainer extends IContainer {
	users: SqliteObjectView<UserRecord>;
}

const builder = new ContainerBuilder<ObjectViewContainer>();
builder.registerInstance(db, 'viewModelSqliteDb');
builder.registerProjection(UsersProjection, 'users');
```

The physical object table is `${tableName}_${schemaVersion}`; the example uses `users_1`. Its rows contain an id,
JSON data, and a version used for optimistic updates. `SqliteObjectView.get()` waits for restoration to finish;
only use `getSync()` after the view is ready.

## Asynchronous reads

`better-sqlite3` executes queries synchronously. When a read could block the application's main thread, use
`SqliteWorkerProxy` to execute it in a Node.js worker and receive the result through a Promise-based API.

Install the optional worker dependency:

```bash
npm install comlink
```

The worker opens a separate, read-only connection to an existing file-backed database. It cannot share an
`:memory:` database or an open `Database` instance with the main thread.

```ts
import { SqliteWorkerProxy } from 'node-cqrs/sqlite-workers';

type UserRow = {
	userId: string;
	username: string;
};

const reads = new SqliteWorkerProxy({
	dbConfig: {
		dbLocation: 'application.sqlite',
		pragmas: ['query_only = ON']
	}
});

const findUser = await reads.prepare<[string], UserRow>(`
	SELECT user_id AS userId, username
	FROM users
	WHERE user_id = ?
`);

const user = await findUser.get(['user-123']);
const users = await reads.all<UserRow>(`
	SELECT user_id AS userId, username
	FROM users
	ORDER BY username
`);

await reads.dispose();
```

Use `prepare()` for repeated queries, or `get()` and `all()` for one-off reads. Call `dispose()` during application
shutdown to terminate the worker.

### Custom worker connection

The default `dbLocation` configuration uses `better-sqlite3`. Use a custom worker database factory when the
connection requires another driver or setup that must happen before the first query, such as applying an
encryption key.

The factory is a separate module loaded inside the worker. It must export `createSqliteWorkerDb`, which receives
the exact value supplied as `dbFactoryParams` and returns an open database connection:

```ts
// sqlite-worker-db.ts
import createEncryptedDb from 'better-sqlite3-multiple-ciphers';

type WorkerDbParams = {
	dbLocation: string;
	encryptionKey: string;
};

export function createSqliteWorkerDb({ dbLocation, encryptionKey }: WorkerDbParams) {
	const db = createEncryptedDb(dbLocation, {
		readonly: true,
		fileMustExist: true
	});

	db.pragma('cipher = aes256cbc');
	db.key(Buffer.from(encryptionKey, 'utf8'));
	return db;
}
```

Resolve asynchronous dependencies before creating the proxy, then pass the resulting values to that factory:

```ts
import { SqliteWorkerProxy } from 'node-cqrs/sqlite-workers';

const { filename, encryptionKey } = await credentialsStore.getSqliteCredentials();

const reads = new SqliteWorkerProxy({
	dbConfig: {
		dbFactoryLocation: new URL('./sqlite-worker-db.js', import.meta.url),
		dbFactoryParams: {
			dbLocation: filename,
			encryptionKey
		}
	}
});
```

`dbFactoryParams` is copied to the worker using Node.js structured cloning. Pass data such as strings, arrays,
and plain objects; do not pass the DI container, functions, or an open database connection. `dbFactoryLocation`
must point to the runnable JavaScript module available after compilation, which is why the TypeScript example
references `sqlite-worker-db.js`.

## Restore and schema versions

`registerProjection()` starts restoration from the last saved checkpoint. Wait for all restoration promises
before serving requests that depend on views:

```ts
const { restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);
```

Change `schemaVersion` when the shape or meaning of a read model changes and its events must be replayed. Object
views write to a new versioned table automatically. Relational views own their table naming and migration logic.

## Operations

- `:memory:` databases exist only for the lifetime of one connection. A factory that opens a new `:memory:`
  connection gives each accessor an isolated database; return a shared connection when components must use the
  same database.
- File-backed databases persist after shutdown. The application must close every connection it creates.
- Tables and indexes are created lazily on first use.
- The module uses synchronous `better-sqlite3` operations behind asynchronous CQRS interfaces. Use
  [`SqliteWorkerProxy`](#asynchronous-reads) for reads that should run outside the main thread.
- The module is designed for one application process. PostgreSQL or MongoDB is a better fit for distributed
  writers.

## Advanced APIs

Most consumers do not need to construct these classes directly:

| Class | Use directly when |
|---|---|
| `SqliteObjectView` | A custom projection needs the standard object storage and checkpoint behavior |
| `SqliteObjectStorage` | Only SQLite-backed key/value storage is needed |
| `SqliteViewLocker` | A custom component needs restoration locking |
| `SqliteEventLocker` | A custom projection needs event deduplication and checkpoints |

## Run locally

Run the complete event-store and JSON object-view example:

```bash
npm run example:sqlite
```

The complete source is [examples/sqlite/index.ts](../../examples/sqlite/index.ts).

Run the SQLite integration tests with:

```bash
npm run test:sqlite
```
