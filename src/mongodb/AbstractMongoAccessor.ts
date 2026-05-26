import type { Db } from 'mongodb';
import type { IContainer } from 'node-cqrs';
import { Lock } from '../utils/index.ts';

/**
 * Abstract base class for accessing a MongoDB database.
 *
 * Manages the database connection lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a Db instance directly or a factory function for lazy initialization.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks
 * (e.g. creating collections or indexes).
 */
export abstract class AbstractMongoAccessor {

	protected db: Db | undefined;
	readonly #dbFactory: (() => Promise<Db> | Db) | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;

	constructor(c: Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory'>>) {
		if (!c.viewModelMongoDb && !c.viewModelMongoDbFactory)
			throw new TypeError('either viewModelMongoDb or viewModelMongoDbFactory argument required');

		this.db = c.viewModelMongoDb;
		this.#dbFactory = c.viewModelMongoDbFactory;
	}

	protected abstract initialize(db: Db): Promise<void> | void;

	/**
	 * Ensures that the MongoDB connection is initialized.
	 * Uses a lock to prevent race conditions during concurrent initialization attempts.
	 * If the database is not already set, it creates one using the provided factory
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
}
