import { IContainer } from '../interfaces';
import { Lock } from '../utils';
import { Database } from 'better-sqlite3';

/**
 * Abstract base class for accessing a SQLite database.
 *
 * Manages the database connection lifecycle, ensuring initialization via `assertDb`.
 * Supports providing a database instance directly or a factory function for lazy initialization.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks.
 */
export abstract class AbstractSqliteAccessor {

	protected db: Database | undefined;
	#dbFactory: (() => Promise<Database> | Database) | undefined;
	#initLocker = new Lock();
	#initialized = false;

	constructor(c: Pick<IContainer, 'viewModelSqliteDb' | 'viewModelSqliteDbFactory'>) {
		if (!c.viewModelSqliteDb && !c.viewModelSqliteDbFactory)
			throw new TypeError('either viewModelSqliteDb or viewModelSqliteDbFactory argument required');

		this.db = c.viewModelSqliteDb;
		this.#dbFactory = c.viewModelSqliteDbFactory;
	}

	protected abstract initialize(db: Database): Promise<void> | void;

	/**
	 * Ensures that the database connection is initialized.
	 * Uses a lock to prevent race conditions during concurrent initialization attempts.
	 * If the database is not already initialized, it creates the database connection
	 * using the provided factory and calls the `initialize` method.
	 *
	 * This method is idempotent and safe to call multiple times.
	 */
	async assertConnection() {
		if (this.#initialized)
			return;

		try {
			this.#initLocker.acquire();
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
}
