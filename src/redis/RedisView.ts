import type { IContainer } from 'node-cqrs';
import type { IEvent, IEventLocker, ILogger, IObjectStorage, IViewLocker } from '../interfaces/index.ts';
import { RedisViewLocker, RedisViewLockerParams } from './RedisViewLocker.ts';
import { RedisEventLocker, RedisEventLockerParams } from './RedisEventLocker.ts';
import { RedisObjectStorage } from './RedisObjectStorage.ts';
import { AbstractRedisAccessor } from './AbstractRedisAccessor.ts';
import { assertString } from '../utils/assert.ts';
import type { Redis } from 'ioredis';

/**
 * Redis-backed projection view with object storage, restore locking and last-processed-event tracking
 */
export class RedisView<TRecord> extends AbstractRedisAccessor
	implements IObjectStorage<TRecord>, IViewLocker, IEventLocker {

	protected readonly schemaVersion: string;
	protected readonly viewLocker: RedisViewLocker;
	protected readonly eventLocker: RedisEventLocker;
	#objectStorage: RedisObjectStorage<TRecord>;
	protected logger: ILogger | undefined;

	get ready(): boolean {
		return this.viewLocker.ready;
	}

	constructor(options: Partial<Pick<IContainer, 'viewModelRedis' | 'viewModelRedisFactory' | 'logger'>>
		& RedisViewLockerParams
		& RedisEventLockerParams
		& { tableNamePrefix: string }) {
		assertString(options?.tableNamePrefix, 'options.tableNamePrefix');
		assertString(options?.schemaVersion, 'options.schemaVersion');

		super(options);

		this.schemaVersion = options.schemaVersion;
		this.viewLocker = new RedisViewLocker(options);
		this.eventLocker = new RedisEventLocker(options);
		this.#objectStorage = new RedisObjectStorage<TRecord>({
			viewModelRedis: options.viewModelRedis,
			viewModelRedisFactory: options.viewModelRedisFactory,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`
		});
		this.logger = options.logger && 'child' in options.logger ?
			options.logger.child({ serviceName: new.target.name }) :
			options.logger;
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_redis: Redis): void {
		// No Redis-level setup required; lockers and storage initialize themselves
	}

	async lock() {
		return this.viewLocker.lock();
	}

	async unlock(): Promise<void> {
		await this.viewLocker.unlock();
	}

	once(event: 'ready') {
		return this.viewLocker.once(event);
	}

	getLastEvent() {
		return this.eventLocker.getLastEvent();
	}

	tryMarkAsProjecting(event: IEvent) {
		return this.eventLocker.tryMarkAsProjecting(event);
	}

	markAsProjected(event: IEvent) {
		return this.eventLocker.markAsProjected(event);
	}

	markAsLastEvent(event: IEvent) {
		return this.eventLocker.markAsLastEvent(event);
	}

	async get(id: string): Promise<TRecord | undefined> {
		if (!this.ready)
			await this.once('ready');

		return this.#objectStorage.get(id);
	}

	async create(id: string, data: TRecord) {
		await this.#objectStorage.create(id, data);
	}

	async update(id: string, update: (r: TRecord) => TRecord) {
		await this.#objectStorage.update(id, update);
	}

	async updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		await this.#objectStorage.updateEnforcingNew(id, update);
	}

	async delete(id: string): Promise<boolean> {
		return this.#objectStorage.delete(id);
	}
}
