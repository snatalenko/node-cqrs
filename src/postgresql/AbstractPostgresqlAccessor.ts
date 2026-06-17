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

const transactionConnectionStorage = new AsyncLocalStorage<PostgresqlConnection>();

/**
 * Abstract base class for accessing a PostgreSQL connection.
 *
 * Manages the connection lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a query-capable connection directly or a factory function for lazy initialization.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks.
 */
export abstract class AbstractPostgresqlAccessor {

	protected db: PostgresqlConnection | undefined;
	readonly #dbFactory: (() => Promise<PostgresqlConnection> | PostgresqlConnection) | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;

	constructor(c: Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory'>>) {
		if (!c.viewModelPostgresqlDb && !c.viewModelPostgresqlDbFactory)
			throw new TypeError('either viewModelPostgresqlDb or viewModelPostgresqlDbFactory argument required');

		this.db = c.viewModelPostgresqlDb;
		this.#dbFactory = c.viewModelPostgresqlDbFactory;
	}

	protected abstract initialize(db: PostgresqlConnection): Promise<void> | void;

	protected get connection(): PostgresqlConnection {
		return transactionConnectionStorage.getStore() ?? this.db!;
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

		if (transactionConnectionStorage.getStore())
			return callback();

		const transactionConnection = await this.getTransactionConnection();

		await transactionConnection.query('BEGIN');
		try {
			const result = await transactionConnectionStorage.run(transactionConnection, callback);
			await transactionConnection.query('COMMIT');
			return result;
		}
		catch (error) {
			await transactionConnection.query('ROLLBACK');
			throw error;
		}
		finally {
			if ('release' in transactionConnection)
				transactionConnection.release();
		}
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
