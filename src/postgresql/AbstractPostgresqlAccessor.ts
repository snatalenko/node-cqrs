import type { IContainer } from 'node-cqrs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Lock } from '../utils/index.ts';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';

type ReleasablePostgresqlConnection = PostgresqlConnection & {
	release(): void;
};

type PostgresqlConnectionPool = PostgresqlConnection & {
	connect(): Promise<ReleasablePostgresqlConnection>;
};

type TransactionContext = {
	connection: PostgresqlConnection;
	commitCallbacks: Array<() => void>;
};

/**
 * Transaction storage per connection pool.
 * Accessors sharing a pool share its transactions, while transactions of other pools stay isolated.
 */
const transactionStorages = new WeakMap<PostgresqlConnection, AsyncLocalStorage<TransactionContext>>();

/**
 * Connections with a transaction in progress.
 * A single (non-pool) connection runs transactions itself, so all its queries see uncommitted changes meanwhile.
 */
const connectionsInTransaction = new WeakSet<PostgresqlConnection>();

type PostgresqlAccessorParams = {
	db?: PostgresqlConnection;
	dbFactory?: () => Promise<PostgresqlConnection> | PostgresqlConnection;
} & Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory'>>;

/**
 * Abstract base class for accessing a PostgreSQL connection.
 *
 * Manages the connection lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a query-capable connection directly or a factory function for lazy initialization.
 *
 * Transactions started with `runInTransaction` are shared by accessors using the same connection pool instance,
 * so a factory must return the same pool for accessors expected to participate in the same transaction.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks.
 */
export abstract class AbstractPostgresqlAccessor {

	protected db: PostgresqlConnection | undefined;
	readonly #dbFactory: (() => Promise<PostgresqlConnection> | PostgresqlConnection) | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;

	constructor(c: PostgresqlAccessorParams) {
		const db = c.db ?? c.viewModelPostgresqlDb;
		const dbFactory = c.dbFactory ?? c.viewModelPostgresqlDbFactory;

		if (!db && !dbFactory)
			throw new TypeError('either viewModelPostgresqlDb or viewModelPostgresqlDbFactory argument required');

		this.db = db;
		this.#dbFactory = dbFactory;
	}

	protected abstract initialize(db: PostgresqlConnection): Promise<void> | void;

	/** Transaction storage of the accessor connection pool, available once the connection is initialized */
	get #transactionStorage(): AsyncLocalStorage<TransactionContext> | undefined {
		if (!this.db)
			return undefined;

		let storage = transactionStorages.get(this.db);
		if (!storage) {
			storage = new AsyncLocalStorage();
			transactionStorages.set(this.db, storage);
		}

		return storage;
	}

	/** Current transaction of the accessor connection pool */
	get #transaction(): TransactionContext | undefined {
		return this.#transactionStorage?.getStore();
	}

	protected get connection(): PostgresqlConnection {
		return this.#transaction?.connection ?? this.db!;
	}

	/**
	 * Whether queries through `this.db` see committed changes only.
	 * Always the case for connection pools, and for a single connection while it runs no transaction,
	 * since its queries are executed within the transaction otherwise.
	 */
	protected get readsCommittedOnly(): boolean {
		return !connectionsInTransaction.has(this.db!);
	}

	/**
	 * Runs the callback after the current transaction of the accessor connection pool is committed,
	 * or immediately outside of a transaction. Callbacks of rolled back transactions are discarded.
	 */
	protected afterCommit(callback: () => void) {
		const transaction = this.#transaction;
		if (transaction)
			transaction.commitCallbacks.push(callback);
		else
			callback();
	}

	/**
	 * Ensures that the PostgreSQL connection is initialized.
	 * Uses a lock to prevent race conditions during concurrent initialization attempts.
	 * If the connection is not already set, it creates one using the provided factory
	 * and then calls the `initialize` method.
	 *
	 * This method is idempotent and safe to call multiple times.
	 */
	async assertConnection() {
		if (this.#initialized)
			return;

		try {
			await this.#initLocker.acquire();
			if (this.#initialized)
				return;

			if (!this.db)
				this.db = await this.#dbFactory!();

			await this.initialize(this.db);

			this.#initialized = true;
		}
		finally {
			this.#initLocker.release();
		}
	}

	async runInTransaction<T>(callback: () => Promise<T> | T): Promise<T> {
		await this.assertConnection();

		if (this.#transaction)
			return callback();

		const transactionStorage = this.#transactionStorage!;
		const transactionConnection = await this.getTransactionConnection();
		const transaction: TransactionContext = { connection: transactionConnection, commitCallbacks: [] };

		let result: T;

		connectionsInTransaction.add(transactionConnection);
		try {
			await transactionConnection.query('BEGIN');
			try {
				result = await transactionStorage.run(transaction, callback);
				await transactionConnection.query('COMMIT');
			}
			catch (error) {
				await transactionConnection.query('ROLLBACK');
				throw error;
			}
		}
		finally {
			connectionsInTransaction.delete(transactionConnection);
			if ('release' in transactionConnection)
				transactionConnection.release();
		}

		for (const commitCallback of transaction.commitCallbacks)
			commitCallback();

		return result;
	}

	private async getTransactionConnection(): Promise<PostgresqlConnection | ReleasablePostgresqlConnection> {
		if (AbstractPostgresqlAccessor.isConnectionPool(this.db))
			return this.db.connect();

		return this.db!;
	}

	private static isConnectionPool(db: PostgresqlConnection | undefined): db is PostgresqlConnectionPool {
		return typeof (db as PostgresqlConnectionPool | undefined)?.connect === 'function';
	}
}
