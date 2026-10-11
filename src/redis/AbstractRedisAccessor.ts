import type { RedisProjectionDbFactoryParams } from './RedisProjectionDataParams.ts';
import type { Redis } from 'ioredis';
import { Lock } from '../utils/index.ts';

/**
 * Abstract base class for accessing a Redis instance.
 *
 * Manages the Redis client lifecycle, ensuring initialization via `assertConnection`.
 * Supports providing a Redis instance directly or a factory function for lazy initialization.
 * The optional `redisFactoryParams` object is passed unchanged to the factory.
 *
 * Subclasses must implement the `initialize` method for specific setup tasks
 * (e.g. registering Lua commands with `defineCommand`).
 */
export abstract class AbstractRedisAccessor<TFactoryParams extends object = RedisProjectionDbFactoryParams> {

	protected redis: Redis | undefined;
	readonly #redisFactory: ((params?: TFactoryParams) => Promise<Redis> | Redis) | undefined;
	readonly #redisFactoryParams: TFactoryParams | undefined;
	readonly #initLocker = new Lock();
	#initialized = false;

	constructor(c: {
		viewModelRedis?: Redis;
		viewModelRedisFactory?: (params?: TFactoryParams) => Promise<Redis> | Redis;
		redisFactoryParams?: TFactoryParams;
	}) {
		if (!c.viewModelRedis && !c.viewModelRedisFactory)
			throw new TypeError('either viewModelRedis or viewModelRedisFactory argument required');

		this.redis = c.viewModelRedis;
		this.#redisFactory = c.viewModelRedisFactory;
		this.#redisFactoryParams = c.redisFactoryParams;
	}

	protected abstract initialize(redis: Redis): Promise<void> | void;

	/**
	 * Ensures that the Redis connection is initialized.
	 * Uses a lock to prevent race conditions during concurrent initialization attempts.
	 * If the client is not already set, it creates one using the provided factory
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

			if (!this.redis)
				this.redis = await this.#redisFactory!(this.#redisFactoryParams);

			await this.initialize(this.redis);

			this.#initialized = true;
		}
		finally {
			this.#initLocker.release();
		}
	}
}
