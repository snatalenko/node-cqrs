import { IEvent } from '../../interfaces/IEvent';
import { IExtendableLogger, ILogger } from '../../interfaces/ILogger';
import { IPersistentView } from '../../interfaces/IPersistentView';

const guid = (str: string) => Buffer.from(str.replaceAll('-', ''), 'hex');

const EVENT_PROCESSING_LOCK_TTL = 15; // sec

export type AbstractSqliteViewOptions = {
	schemaVersion: string;
	sqliteDb: import('better-sqlite3').Database;
	viewLockTableName?: string;
	logger?: IExtendableLogger | ILogger;
}

export abstract class AbstractSqliteView implements IPersistentView {

	/**
	 * Version of the the schema representing the structure of the data stored in the view
	 */
	readonly schemaVersion: string;

	/**
	 * Shared table where view locks and last projected events are tracked
	 */
	readonly viewLockTableName: string;

	/**
	 * Main table where the view data is stored
	 *
	 * @example `tbl_users_${this.schemaVersion}`
	 */
	abstract get tableName(): string;

	/**
	 * Table where events are being tracked as projecting/projected
	 *
	 * @example `tbl_users_${this.schemaVersion}_event_lock`
	 */
	abstract get eventLockTableName(): string;

	protected db: import('better-sqlite3').Database;
	protected logger: ILogger | undefined;

	#getLastEventQuery: import('better-sqlite3').Statement<unknown[], { last_event: string }>;
	#lockEventQuery: import('better-sqlite3').Statement<[Buffer], void>;
	#finalizeEventLockQuery: import('better-sqlite3').Statement<[Buffer], void>;
	#recordLastEventQuery: import('better-sqlite3').Statement<[string, string, string], void>;
	#upsertTableLockQuery: import('better-sqlite3').Statement<[string, string], void>;
	#removeTableLockQuery: import('better-sqlite3').Statement<[string, string], void>;


	constructor(options: AbstractSqliteViewOptions) {
		this.schemaVersion = options.schemaVersion;
		this.viewLockTableName = options.viewLockTableName ?? 'tbl_view_lock';
		this.db = options.sqliteDb;
		this.logger = options.logger && 'child' in options.logger ?
			options.logger.child({ service: this.constructor.name }) :
			options.logger;
	}

	/**
	 * SQLite tables initialization.
	 * Must be called in the derived class before getting to work.
	 */
	protected initialize(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS ${this.viewLockTableName} (
				table_name TEXT,
				schema_version TEXT,
				locked_at DATETIME DEFAULT (strftime('%s', 'now')),
				last_event TEXT,
				PRIMARY KEY (table_name, schema_version)
			);

			CREATE TABLE IF NOT EXISTS ${this.eventLockTableName} (
				event_id BLOB PRIMARY KEY,
				processing_at DATETIME DEFAULT (strftime('%s', 'now')),
				processed_at DATETIME
			);
		`);

		this.#getLastEventQuery = this.db.prepare(`
			SELECT
				last_event
			FROM ${this.viewLockTableName}
			WHERE
				table_name = ?
				AND schema_version =?
		`);

		this.#lockEventQuery = this.db.prepare(`
			INSERT INTO ${this.eventLockTableName} (event_id)
			VALUES (?)
			ON CONFLICT (event_id)
			DO UPDATE SET
				processing_at = strftime('%s', 'now')
			WHERE
				processed_at IS NULL
				AND processing_at <= strftime('%s', 'now') - ${EVENT_PROCESSING_LOCK_TTL}
		`);

		this.#finalizeEventLockQuery = this.db.prepare(`
			UPDATE ${this.eventLockTableName}
			SET
				processed_at = strftime('%s', 'now')
			WHERE
				event_id = ?
				AND processed_at IS NULL
		`);

		this.#recordLastEventQuery = this.db.prepare(`
			UPDATE ${this.viewLockTableName}
			SET
				last_event = ?
			WHERE
				table_name = ?
				AND schema_version = ?
		`);

		this.#upsertTableLockQuery = this.db.prepare(`
			INSERT INTO ${this.viewLockTableName} (table_name, schema_version, locked_at)
			VALUES (?, ?, strftime('%s', 'now'))
			ON CONFLICT (table_name, schema_version)
			DO UPDATE SET
				locked_at = excluded.locked_at
			WHERE
				locked_at IS NULL
		`);

		this.#removeTableLockQuery = this.db.prepare(`
			UPDATE ${this.viewLockTableName}
			SET
				locked_at = NULL
			WHERE
				table_name = ?
				AND schema_version = ?
				AND locked_at IS NOT NULL
		`);
	}

	getLastEvent() {
		const tableInfoRecord = this.#getLastEventQuery.get(this.tableName, this.schemaVersion);
		if (!tableInfoRecord?.last_event)
			return undefined;

		return JSON.parse(tableInfoRecord.last_event);
	}

	tryMarkAsProjecting(event: IEvent<any>) {
		if (!event.id)
			throw new TypeError('event.id is required');

		const r = this.#lockEventQuery.run(guid(event.id));

		return r.changes !== 0;
	}

	markAsProjected(event: IEvent<any>) {
		if (!event.id)
			throw new TypeError('event.id is required');

		const updateResult = this.#finalizeEventLockQuery.run(guid(event.id));
		if (updateResult.changes === 0)
			throw new Error(`Event ${event.id} could not be marked as processed`);

		this.#recordLastEventQuery.run(JSON.stringify(event), this.tableName, this.schemaVersion);
	}

	ready: boolean = false;

	lock() {
		this.ready = false;

		const upsertResult = this.#upsertTableLockQuery.run(this.tableName, this.schemaVersion);
		if (upsertResult.changes === 1)
			this.logger?.debug(`Table "${this.tableName}" lock obtained`);
		else
			this.logger?.debug(`Table "${this.tableName}" is already locked`);

		// TODO: automatic lock prolongation

		return upsertResult.changes === 1;
	}

	async unlock(): Promise<void> {
		const updateResult = this.#removeTableLockQuery.run(this.tableName, this.schemaVersion);
		if (updateResult.changes === 1)
			this.logger?.debug(`Table "${this.tableName}" lock released`);
		else
			this.logger?.debug(`Table "${this.tableName}" lock didn't exist`);

		this.ready = true;
	}

	async once(eventType: 'ready'): Promise<void> {

		// TODO: periodically check until unlocked

		throw new Error('Method not implemented');
	}
}
