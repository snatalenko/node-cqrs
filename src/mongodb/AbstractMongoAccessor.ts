import type { Db } from 'mongodb';
import type { MongoProjectionDbFactoryParams } from './MongoProjectionDataParams.ts';
import { Lock } from '../utils/index.ts';

/**
 * Abstract base class for accessing a MongoDB database.
 *
 * Manages the database connection lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a Db instance directly or a factory function for lazy initialization.
 * The optional `mongoDbFactoryParams` object is passed unchanged to the factory.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks
 * (e.g. creating collections or indexes).
 */
export abstract class AbstractMongoAccessor<TFactoryParams extends object = MongoProjectionDbFactoryParams> {

	protected db: Db | undefined;
	readonly #dbFactory: ((params?: TFactoryParams) => Promise<Db> | Db) | undefined;
	readonly #dbFactoryParams: TFactoryParams | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;

	constructor(c: {
		mongoDb?: Db;
		mongoDbFactory?: (params?: TFactoryParams) => Promise<Db> | Db;
		mongoDbFactoryParams?: TFactoryParams;
	}) {
		if (!c.mongoDb && !c.mongoDbFactory)
			throw new TypeError('either mongoDb or mongoDbFactory argument required');

		this.db = c.mongoDb;
		this.#dbFactory = c.mongoDbFactory;
		this.#dbFactoryParams = c.mongoDbFactoryParams;
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
				this.db = await this.#dbFactory!(this.#dbFactoryParams);

			await this.initialize(this.db);

			this.#initialized = true;
		}
		finally {
			this.#initLocker.release();
		}
	}
}
