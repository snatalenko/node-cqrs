import { IEvent, IEventLocker, ILogger } from '../interfaces';
import { Database } from 'better-sqlite3';
import { SqliteViewLocker, SqliteViewLockerParams } from './SqliteViewLocker';
import { SqliteEventLocker, SqliteEventLockerParams } from './SqliteEventLocker';
import { IViewLocker } from '../interfaces';

export abstract class AbstractSqliteView implements IViewLocker, IEventLocker {

	protected readonly db: Database;
	protected readonly schemaVersion: string;
	protected readonly viewLocker: SqliteViewLocker;
	protected readonly eventLocker: SqliteEventLocker;
	protected logger: ILogger | undefined;

	get ready(): boolean {
		return this.viewLocker.ready;
	}

	constructor(options: SqliteEventLockerParams & SqliteViewLockerParams) {
		this.db = options.viewModelSqliteDb;
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
