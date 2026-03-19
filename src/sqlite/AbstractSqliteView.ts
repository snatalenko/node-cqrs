import type { IContainer } from 'node-cqrs';
import type { IEvent, IEventLocker, ILogger, IViewLocker } from '../interfaces/index.ts';
import { SqliteViewLocker, SqliteViewLockerParams } from './SqliteViewLocker.ts';
import { SqliteEventLocker, SqliteEventLockerParams } from './SqliteEventLocker.ts';
import { AbstractSqliteAccessor } from './AbstractSqliteAccessor.ts';

/**
 * Base class for SQLite-backed projection views with restore locking and last-processed-event tracking
 */
export abstract class AbstractSqliteView extends AbstractSqliteAccessor implements IViewLocker, IEventLocker {

	protected readonly schemaVersion: string;
	protected readonly viewLocker: SqliteViewLocker;
	protected readonly eventLocker: SqliteEventLocker;
	protected logger: ILogger | undefined;

	get ready(): boolean {
		return this.viewLocker.ready;
	}

	constructor(options: Partial<Pick<IContainer, 'viewModelSqliteDb' | 'viewModelSqliteDbFactory' | 'logger'>>
		& SqliteEventLockerParams
		& SqliteViewLockerParams) {
		super(options);

		this.schemaVersion = options.schemaVersion;
		this.viewLocker = new SqliteViewLocker(options);
		this.eventLocker = new SqliteEventLocker(options);
		this.logger = options.logger && 'child' in options.logger ?
			options.logger.child({ serviceName: new.target.name }) :
			options.logger;
	}

	async lock() {
		return this.viewLocker.lock();
	}

	unlock(): void {
		this.viewLocker.unlock();
	}

	once(event: 'ready') {
		return this.viewLocker.once(event);
	}

	getLastEvent() {
		return this.eventLocker.getLastEvent();
	}

	tryMarkAsProjecting(event: IEvent<any>) {
		return this.eventLocker.tryMarkAsProjecting(event);
	}

	markAsProjected(event: IEvent<any>) {
		return this.eventLocker.markAsProjected(event);
	}
}
