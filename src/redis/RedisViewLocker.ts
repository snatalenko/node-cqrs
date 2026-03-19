import type { Redis } from 'ioredis';
import type { IContainer } from 'node-cqrs';
import type { ILogger, IViewLocker } from '../interfaces/index.ts';
import { assertString, Deferred } from '../utils/index.ts';
import { promisify } from 'util';
import { AbstractRedisAccessor } from './AbstractRedisAccessor.ts';
import type { RedisProjectionDataParams } from './RedisProjectionDataParams.ts';

const delay = promisify(setTimeout);

export type RedisViewLockerParams = RedisProjectionDataParams & {

	/**
	 * (Optional) Time-to-live (TTL) duration (in milliseconds) for which a view remains locked.
	 * The lock is automatically prolonged while still held by this instance.
	 *
	 * @default 120_000
	 */
	viewLockTtl?: number;
};

/**
 * Redis-backed implementation of IViewLocker.
 *
 * Uses a Redis key with NX+PX semantics to acquire a distributed view lock.
 * The lock is automatically prolonged at half the TTL interval via `PEXPIRE`
 * to prevent expiration while processing is in progress.
 *
 * Key format: `{keyPrefix}:viewlock:{projectionName}:{schemaVersion}`
 */
export class RedisViewLocker extends AbstractRedisAccessor implements IViewLocker {

	#projectionName: string;
	#lockKey: string;
	#viewLockTtl: number;
	#lockMarker: Deferred<void> | undefined;
	#lockProlongationTimeout: NodeJS.Timeout | undefined;
	#logger: ILogger | undefined;

	constructor(o: Partial<Pick<IContainer, 'viewModelRedis' | 'viewModelRedisFactory' | 'logger'>>
		& RedisViewLockerParams) {
		super(o);

		assertString(o.projectionName, 'o.projectionName');
		assertString(o.schemaVersion, 'o.schemaVersion');

		this.#projectionName = o.projectionName;

		const keyPrefix = o.keyPrefix ?? 'ncqrs';
		this.#lockKey = `${keyPrefix}:viewlock:${o.projectionName}:${o.schemaVersion}`;
		this.#viewLockTtl = o.viewLockTtl ?? 120_000;
		this.#logger = o.logger && 'child' in o.logger ?
			o.logger.child({ service: this.constructor.name }) :
			o.logger;
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_redis: Redis): void {
		// No Redis-level setup required for view locking
	}

	get ready(): boolean {
		return !this.#lockMarker;
	}

	async lock(): Promise<boolean> {
		this.#lockMarker = new Deferred();

		await this.assertConnection();

		let lockAcquired = false;
		while (!lockAcquired) {
			const result = await this.redis!.set(this.#lockKey, '1', 'PX', this.#viewLockTtl, 'NX');
			lockAcquired = result === 'OK';
			if (!lockAcquired) {
				this.#logger?.debug(`"${this.#projectionName}" is locked by another process`);
				await delay(this.#viewLockTtl / 2);
			}
		}

		this.#logger?.debug(`"${this.#projectionName}" lock obtained for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();

		return true;
	}

	private scheduleLockProlongation() {
		const ms = this.#viewLockTtl / 2;

		this.#lockProlongationTimeout = setTimeout(() => this.prolongLock(), ms);
		this.#lockProlongationTimeout.unref();

		this.#logger?.debug(`"${this.#projectionName}" lock refresh scheduled in ${ms}ms`);
	}

	private cancelLockProlongation() {
		clearTimeout(this.#lockProlongationTimeout);
		this.#logger?.debug(`"${this.#projectionName}" lock refresh canceled`);
	}

	private async prolongLock() {
		await this.assertConnection();

		const result = await this.redis!.pexpire(this.#lockKey, this.#viewLockTtl);
		if (result !== 1)
			throw new Error(`"${this.#projectionName}" lock could not be prolonged`);

		this.#logger?.debug(`"${this.#projectionName}" lock prolonged for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();
	}

	async unlock(): Promise<void> {
		this.#lockMarker?.resolve();
		this.#lockMarker = undefined;

		this.cancelLockProlongation();

		await this.assertConnection();

		const deleted = await this.redis!.del(this.#lockKey);
		if (deleted === 1)
			this.#logger?.debug(`"${this.#projectionName}" lock released`);
		else
			this.#logger?.warn(`"${this.#projectionName}" lock didn't exist`);
	}

	once(event: 'ready'): Promise<void> {
		if (event !== 'ready')
			throw new TypeError(`Unexpected event: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
