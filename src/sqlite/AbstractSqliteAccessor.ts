import type { IContainer } from 'node-cqrs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { promisify } from 'node:util';
import { Lock } from '../utils/index.ts';
import type { Database } from 'better-sqlite3';

const delay = promisify(setTimeout);

type TransactionContext = {
	commitCallbacks: Array<() => void>;

	/** Set once the transaction completes, as async operations started within it can outlive it */
	completed?: boolean;
};

/**
 * Scope shared by accessors using the same database connection.
 * A connection runs one transaction at a time, which accessors sharing the connection join.
 */
type ConnectionScope = {

	/** Transaction in progress of the current async context */
	transactionStorage: AsyncLocalStorage<TransactionContext>;

	/** Held while a transaction is in progress, or while statements run outside of a transaction */
	lock: Lock;
};

const connectionScopes = new WeakMap<Database, ConnectionScope>();

const BUSY_RETRY_DELAY = 10;

/**
 * Starts a transaction holding the database write lock.
 * A write lock held by another connection is awaited asynchronously, up to the connection busy timeout:
 * a synchronous busy wait would block the event loop, and with it the lock holder of the same process.
 */
async function beginImmediate(db: Database) {
	const busyTimeout = db.pragma('busy_timeout', { simple: true }) as number;
	const startedAt = Date.now();

	for (;;) {
		db.pragma('busy_timeout = 0');
		try {
			db.exec('BEGIN IMMEDIATE');
			return;
		}
		catch (error) {
			if ((error as { code?: string }).code !== 'SQLITE_BUSY' || Date.now() - startedAt >= busyTimeout)
				throw error;
		}
		finally {
			db.pragma(`busy_timeout = ${busyTimeout}`);
		}

		await delay(BUSY_RETRY_DELAY);
	}
}

/**
 * Abstract base class for accessing a SQLite database.
 *
 * Manages the database connection lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a database instance directly or a factory function for lazy initialization.
 *
 * Transactions started with `runInTransaction` are shared by accessors using the same database instance,
 * so a factory must return the same instance for accessors expected to participate in the same transaction.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks.
 */
export abstract class AbstractSqliteAccessor {

	protected db: Database | undefined;
	readonly #dbFactory: (() => Promise<Database> | Database) | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;
	readonly #initializedTransactions = new WeakSet<TransactionContext>();

	constructor(c: Partial<Pick<IContainer, 'viewModelSqliteDb' | 'viewModelSqliteDbFactory'>>) {
		if (!c.viewModelSqliteDb && !c.viewModelSqliteDbFactory)
			throw new TypeError('either viewModelSqliteDb or viewModelSqliteDbFactory argument required');

		this.db = c.viewModelSqliteDb;
		this.#dbFactory = c.viewModelSqliteDbFactory;
	}

	protected abstract initialize(db: Database): Promise<void> | void;

	/** Get scope of the accessor database connection, available once the connection is initialized */
	#getConnectionScope(): ConnectionScope {
		let scope = connectionScopes.get(this.db!);
		if (!scope) {
			scope = {
				transactionStorage: new AsyncLocalStorage(),
				lock: new Lock()
			};
			connectionScopes.set(this.db!, scope);
		}

		return scope;
	}

	/** Get transaction in progress of the current async context */
	#getTransaction(): TransactionContext | undefined {
		const transaction = this.#getConnectionScope().transactionStorage.getStore();
		return transaction?.completed ? undefined : transaction;
	}

	/** Check if the schema is initialized, or created within the current transaction that is not committed yet */
	#isInitialized(): boolean {
		if (this.#initialized)
			return true;

		const transaction = this.db && this.#getTransaction();
		return !!transaction && this.#initializedTransactions.has(transaction);
	}

	/**
	 * Ensures that the database connection is initialized.
	 * If the database is not already initialized, it creates the database connection
	 * using the provided factory and calls the `initialize` method.
	 *
	 * Within a transaction, the schema is created in that transaction
	 * and is considered initialized only once the transaction is committed.
	 *
	 * This method is idempotent and safe to call multiple times.
	 */
	async assertConnection() {
		if (this.#isInitialized())
			return;

		if (!this.db) {
			await this.#initLocker.runExclusively(undefined, async () => {
				this.db ??= await this.#dbFactory!();
			});
		}

		// Outside of a transaction, the connection lock prevents schema changes
		// from joining a transaction of another caller
		const transaction = this.#getTransaction();
		const locker = transaction ? this.#initLocker : this.#getConnectionScope().lock;

		await locker.runExclusively(undefined, async () => {
			if (this.#isInitialized())
				return;

			await this.initialize(this.db!);

			if (transaction)
				this.#initializedTransactions.add(transaction);

			this.afterCommit(() => {
				this.#initialized = true;
			});
		});
	}

	/**
	 * Runs the synchronous callback with exclusive access to the database connection:
	 * within the current transaction, or once transactions of other callers complete,
	 * so that its statements neither observe nor join their uncommitted changes.
	 */
	protected async runExclusively<T>(callback: (db: Database) => T): Promise<T> {
		await this.assertConnection();

		if (this.#getTransaction())
			return callback(this.db!);

		return this.#getConnectionScope().lock.runExclusively(undefined, () => callback(this.db!));
	}

	/**
	 * Runs the callback within a transaction of the accessor database connection.
	 * Joins the current transaction, when already started by an accessor using the same database instance.
	 *
	 * Transactions of a connection are serialized, and statements of other callers wait until they complete.
	 * The transaction is started with `BEGIN IMMEDIATE`, holding the database write lock until it completes.
	 */
	async runInTransaction<T>(callback: () => Promise<T> | T): Promise<T> {
		await this.assertConnection();

		if (this.#getTransaction())
			return callback();

		const { transactionStorage, lock } = this.#getConnectionScope();
		const db = this.db!;
		const transaction: TransactionContext = { commitCallbacks: [] };

		const result = await lock.runExclusively(undefined, async () => {
			await beginImmediate(db);
			try {
				const callbackResult = await transactionStorage.run(transaction, callback);
				db.exec('COMMIT');
				return callbackResult;
			}
			catch (error) {
				// SQLite rolls the transaction back by itself on some errors
				if (db.inTransaction)
					db.exec('ROLLBACK');

				throw error;
			}
			finally {
				transaction.completed = true;
			}
		});

		for (const commitCallback of transaction.commitCallbacks)
			commitCallback();

		return result;
	}

	/**
	 * Runs the callback after the current transaction of the accessor database connection is committed,
	 * or immediately outside of a transaction. Callbacks of rolled back transactions are discarded.
	 */
	protected afterCommit(callback: () => void) {
		const transaction = this.#getTransaction();
		if (transaction)
			transaction.commitCallbacks.push(callback);
		else
			callback();
	}
}
