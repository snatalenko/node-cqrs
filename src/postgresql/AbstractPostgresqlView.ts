import type { IContainer } from 'node-cqrs';
import type { IEvent, IEventLocker, ILogger, IViewLocker } from '../interfaces/index.ts';
import { assertString } from '../utils/assert.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import { PostgresqlEventLocker, type PostgresqlEventLockerParams } from './PostgresqlEventLocker.ts';
import { PostgresqlViewLocker, type PostgresqlViewLockerParams } from './PostgresqlViewLocker.ts';

/**
 * Base class for PostgreSQL-backed projection views with restore locking and last-processed-event tracking.
 */
export abstract class AbstractPostgresqlView extends AbstractPostgresqlAccessor implements IViewLocker, IEventLocker {

	protected readonly schemaVersion: string;
	protected readonly viewLocker: PostgresqlViewLocker;
	protected readonly eventLocker: PostgresqlEventLocker;
	protected logger: ILogger | undefined;

	get ready(): boolean {
		return this.viewLocker.ready;
	}

	constructor(options: Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory' | 'logger'>>
		& PostgresqlEventLockerParams
		& PostgresqlViewLockerParams) {
		assertString(options.projectionName, 'projectionName');
		assertString(options.schemaVersion, 'schemaVersion');

		super(options);

		this.schemaVersion = options.schemaVersion;
		this.viewLocker = new PostgresqlViewLocker(options);
		this.eventLocker = new PostgresqlEventLocker(options);
		this.logger = options.logger && 'child' in options.logger ?
			options.logger.child({ serviceName: new.target.name }) :
			options.logger;
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
