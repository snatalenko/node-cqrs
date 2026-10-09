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

/**
 * Errors raised when concurrent sessions create the same object, which `IF NOT EXISTS` does not prevent.
 * The conflicting object is committed by then, so repeating the initialization skips it.
 */
const CONCURRENT_CREATION_ERROR_CODES = new Set(['23505', '42P07', '42710']);
const MAX_INITIALIZE_ATTEMPTS = 5;

const isConcurrentCreationError = (error: unknown) =>
	CONCURRENT_CREATION_ERROR_CODES.has((error as { code?: string } | undefined)?.code ?? '');

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
	readonly #initializedTransactions = new WeakSet<TransactionContext>();

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

	/** Get current transaction of the accessor connection pool */
	#getTransaction(): TransactionContext | undefined {
		return this.#transactionStorage?.getStore();
	}

	/** Get connection of current transaction, or general connection pool when outside of transaction */
	protected get connection(): PostgresqlConnection {
		return this.#getTransaction()?.connection ?? this.db!;
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
		const transaction = this.#getTransaction();
		if (transaction)
			transaction.commitCallbacks.push(callback);
		else
			callback();
	}

	/** Check if the schema is initialized, or created within the current transaction that is not committed yet */
	#isInitialized(): boolean {
		const transaction = this.#getTransaction();
		return this.#initialized || (!!transaction && this.#initializedTransactions.has(transaction));
	}

	/**
	 * Ensures that the PostgreSQL connection is initialized.
	 * Uses a lock to prevent race conditions during concurrent initialization attempts.
	 * If the connection is not already set, it creates one using the provided factory
	 * and then calls the `initialize` method.
	 *
	 * Within a transaction, the schema is created on the transaction connection
	 * and is considered initialized only once the transaction is committed.
	 *
	 * This method is idempotent and safe to call multiple times.
	 */
	async assertConnection() {
		if (this.#isInitialized())
			return;

		try {
			await this.#initLocker.acquire();
			if (!this.db)
				this.db = await this.#dbFactory!();

			if (this.#isInitialized())
				return;

			const transaction = this.#getTransaction();
			if (transaction) {
				await this.initialize(transaction.connection);
				this.#initializedTransactions.add(transaction);

				transaction.commitCallbacks.push(() => {
					this.#initialized = true;
				});
			}
			else {
				await this.#initializeRetryingConcurrentCreation(this.db);
				this.#initialized = true;
			}
		}
		finally {
			this.#initLocker.release();
		}
	}

	async #initializeRetryingConcurrentCreation(db: PostgresqlConnection) {
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.initialize(db);
			}
			catch (error) {
				if (attempt === MAX_INITIALIZE_ATTEMPTS || !isConcurrentCreationError(error))
					throw error;
			}
		}
	}

	async runInTransaction<T>(callback: () => Promise<T> | T): Promise<T> {
		await this.assertConnection();

		if (this.#getTransaction())
			return callback();

		const transactionStorage = this.#transactionStorage!;
		const pooledConnection = AbstractPostgresqlAccessor.isConnectionPool(this.db) ?
			await this.db.connect() :
			undefined;
		const transactionConnection = pooledConnection ?? this.db!;
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
			pooledConnection?.release();
		}

		for (const commitCallback of transaction.commitCallbacks)
			commitCallback();

		return result;
	}

	/** A pool hands out releasable connections; a connection checked out of a pool already is not a pool itself */
	private static isConnectionPool(db: PostgresqlConnection | undefined): db is PostgresqlConnectionPool {
		return typeof (db as PostgresqlConnectionPool | undefined)?.connect === 'function' && !('release' in db!);
	}
}
