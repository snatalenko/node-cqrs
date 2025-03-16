import { IEvent } from '../../interfaces/IEvent';
import { IExtendableLogger, ILogger } from '../../interfaces/ILogger';
import { IPersistentView } from '../../interfaces/IPersistentView';
import { getEventId } from './utils';
import { Database, Statement } from 'better-sqlite3';

export type AbstractSqliteViewOptions = {
	schemaVersion?: string;
	sqliteDb: Database;
	viewLockTableName?: string;
	logger?: IExtendableLogger | ILogger;
	eventProcessingLockTtl?: number;
	viewRestoringLockTtl?: number;
}

export abstract class AbstractSqliteView implements IPersistentView {

	#schemaVersion: string | undefined;
	#viewLockTableName: string | undefined;
	#getLastEventQuery: Statement<unknown[], { last_event: string }>;
	#lockEventQuery: Statement<[Buffer], void>;
	#finalizeEventLockQuery: Statement<[Buffer], void>;
	#recordLastEventQuery: Statement<[string, string, string], void>;
	#upsertTableLockQuery: Statement<[string, string], void>;
	#removeTableLockQuery: Statement<[string, string], void>;
	#eventProcessingLockTtl: number;
	#viewRestoringLockTtl: number;

	protected db: Database;
	protected logger: ILogger | undefined;

	/**
	 * Shared table tracking view locks and last projected events.
	 * Defaults to "tbl_view_lock" if not provided or overridden.
	 */
	get viewLockTableName(): string {
		return this.#viewLockTableName ?? 'tbl_view_lock';
	}

	/**
	 * Version of the schema representing the structure of data stored in the view
	 */
	get schemaVersion(): string {
		if (!this.#schemaVersion)
			throw new Error(`schemaVersion is not defined. Either pass it to constructor, or override the getter`);

		return this.#schemaVersion;
	}

	/**
	 * Table where events are being tracked as projecting/projected
	 *
	 * @example `tbl_users_${this.schemaVersion}_event_lock`
	 */
	get eventLockTableName(): string {
		return `${this.tableName}_event_lock`;
	}

	/**
	 * Main table where the view data is stored
	 *
	 * @example `tbl_users_${this.schemaVersion}`
	 */
	abstract get tableName(): string;

	constructor(options: AbstractSqliteViewOptions) {
		this.#schemaVersion = options.schemaVersion;
		this.#viewLockTableName = options.viewLockTableName;
		this.#eventProcessingLockTtl = options.eventProcessingLockTtl ?? 15;
		this.#viewRestoringLockTtl = options.viewRestoringLockTtl ?? 120;
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
				AND processing_at <= strftime('%s', 'now') - ${this.#eventProcessingLockTtl}
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

		this.logger?.info(`View "${this.constructor.name}" lock tables initialized`);
	}

	getLastEvent() {
		const tableInfoRecord = this.#getLastEventQuery.get(this.tableName, this.schemaVersion);
		if (!tableInfoRecord?.last_event)
			return undefined;

		return JSON.parse(tableInfoRecord.last_event);
	}

	tryMarkAsProjecting(event: IEvent<any>) {
		const eventId = getEventId(event);

		const r = this.#lockEventQuery.run(eventId);

		return r.changes !== 0;
	}

	markAsProjected(event: IEvent<any>) {
		const eventId = getEventId(event);

		const updateResult = this.#finalizeEventLockQuery.run(eventId);
		if (updateResult.changes === 0)
			throw new Error(`Event ${event.id} could not be marked as processed`);

		this.#recordLastEventQuery.run(JSON.stringify(event), this.tableName, this.schemaVersion);
	}

	ready: boolean = false;

	lock() {
		this.ready = false;

		const upsertResult = this.#upsertTableLockQuery.run(this.tableName, this.schemaVersion);

		if (upsertResult.changes === 1) {
			this.logger?.debug(`Table "${this.tableName}" lock obtained`);

			// TODO: automatic lock prolongation

			return true;
		}
		else {
			this.logger?.debug(`Table "${this.tableName}" is already locked`);
			return false;
		}
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
