import type { Db } from 'mongodb';
import type { IContainer } from 'node-cqrs';
import type { IEvent, IEventLocker, ILogger, IViewLocker } from '../interfaces/index.ts';
import { MongoViewLocker, type MongoViewLockerParams } from './MongoViewLocker.ts';
import { MongoEventLocker, type MongoEventLockerParams } from './MongoEventLocker.ts';
import { AbstractMongoAccessor } from './AbstractMongoAccessor.ts';
import { assertString } from '../utils/assert.ts';

/**
 * Base class for MongoDB-backed projection views with restore locking and last-processed-event tracking
 */
export abstract class AbstractMongoView extends AbstractMongoAccessor implements IViewLocker, IEventLocker {

	protected readonly schemaVersion: string;
	protected readonly viewLocker: MongoViewLocker;
	protected readonly eventLocker: MongoEventLocker;
	protected logger: ILogger | undefined;

	get ready(): boolean {
		return this.viewLocker.ready;
	}

	constructor(options: Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory' | 'logger'>>
		& MongoEventLockerParams
		& MongoViewLockerParams) {
		assertString(options.projectionName, 'projectionName');
		assertString(options.schemaVersion, 'schemaVersion');

		super(options);

		this.schemaVersion = options.schemaVersion;
		this.viewLocker = new MongoViewLocker(options);
		this.eventLocker = new MongoEventLocker(options);
		this.logger = options.logger && 'child' in options.logger ?
			options.logger.child({ serviceName: new.target.name }) :
			options.logger;
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_db: Db): Promise<void> | void {
		// Lockers initialize themselves on first use
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
}
