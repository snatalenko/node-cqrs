import { Database, Statement } from 'better-sqlite3';
import { IEvent, IEventLocker } from '../../interfaces';
import { getEventId } from './utils';
import { viewLockTableInit, eventLockTableInit } from './queries';
import { SqliteViewLockerParams } from './SqliteViewLocker';
import { SqliteDbParams, SqliteProjectionDataParams } from './commonParams';

export type SqliteEventLockerParams = SqliteDbParams & SqliteProjectionDataParams & {
	/**
	 * (Optional) SQLite table name where event locks are stored
	 * 
	 * @default "tbl_event_lock"
	 */
	eventLockTableName?: string;

	/**
	 * (Optional) Time-to-live (TTL) duration in milliseconds
	 * for which an event remains in the "processing" state until released.
	 *
	 * @default 15_000
	 */
	eventLockTtl?: number;
}
	& Pick<SqliteViewLockerParams, 'viewLockTableName'>;

export class SqliteEventLocker implements IEventLocker {

	#db: Database;
	#projectionName: string;
	#schemaVersion: string;
	#viewLockTableName: string;
	#eventLockTableName: string;
	#eventLockTtl: number;

	#upsertLastEventQuery: Statement<[string, string, string], void>;
	#getLastEventQuery: Statement<[string, string], { last_event: string }>;
	#lockEventQuery: Statement<[string, string, Buffer], void>;
	#finalizeEventLockQuery: Statement<[string, string, Buffer], void>;

	constructor(o: SqliteEventLockerParams) {
		if (!o.viewModelSqliteDb)
			throw new TypeError('viewModelSqliteDb argument required');
		if (!o.projectionName)
			throw new TypeError('projectionName argument required');
		if (!o.schemaVersion)
			throw new TypeError('schemaVersion argument required');

		this.#db = o.viewModelSqliteDb;
		this.#projectionName = o.projectionName;
		this.#schemaVersion = o.schemaVersion;
		this.#viewLockTableName = o.viewLockTableName ?? 'tbl_view_lock';
		this.#eventLockTableName = o.eventLockTableName ?? 'tbl_event_lock';
		this.#eventLockTtl = o.eventLockTtl ?? 15_000;

		this.#initialize();
	}

	#initialize() {
		this.#db.exec(viewLockTableInit(this.#viewLockTableName));
		this.#db.exec(eventLockTableInit(this.#eventLockTableName));

		this.#upsertLastEventQuery = this.#db.prepare(`
			INSERT INTO ${this.#viewLockTableName} (projection_name, schema_version, last_event)
			VALUES (?, ?, ?)
			ON CONFLICT (projection_name, schema_version)
			DO UPDATE SET
				last_event = excluded.last_event
		`);

		this.#getLastEventQuery = this.#db.prepare(`
			SELECT
				last_event
			FROM ${this.#viewLockTableName}
			WHERE
				projection_name = ?
				AND schema_version =?
		`);

		this.#lockEventQuery = this.#db.prepare(`
			INSERT INTO ${this.#eventLockTableName} (projection_name, schema_version, event_id)
			VALUES (?, ?, ?)
			ON CONFLICT (projection_name, schema_version, event_id)
			DO UPDATE SET
				processing_at = cast(strftime('%f', 'now') * 1000 as INTEGER)
			WHERE
				processed_at IS NULL
				AND processing_at <= cast(strftime('%f', 'now') * 1000 as INTEGER) - ${this.#eventLockTtl}
		`);

		this.#finalizeEventLockQuery = this.#db.prepare(`
			UPDATE ${this.#eventLockTableName}
			SET
				processed_at = (cast(strftime('%f', 'now') * 1000 as INTEGER))
			WHERE
				projection_name = ?
				AND schema_version = ?
				AND event_id = ?
				AND processed_at IS NULL
		`);
	}

	tryMarkAsProjecting(event: IEvent<any>) {
		const eventId = getEventId(event);

		const r = this.#lockEventQuery.run(this.#projectionName, this.#schemaVersion, eventId);

		return r.changes !== 0;
	}

	markAsProjected(event: IEvent<any>) {
		const eventId = getEventId(event);

		const transaction = this.#db.transaction(() => {
			const updateResult = this.#finalizeEventLockQuery.run(this.#projectionName, this.#schemaVersion, eventId);
			if (updateResult.changes === 0)
				throw new Error(`Event ${event.id} could not be marked as processed`);

			this.#upsertLastEventQuery.run(this.#projectionName, this.#schemaVersion, JSON.stringify(event));
		});

		transaction();
	}

	getLastEvent(): IEvent<any> | undefined {
		const viewInfoRecord = this.#getLastEventQuery.get(this.#projectionName, this.#schemaVersion);
		if (!viewInfoRecord?.last_event)
			return undefined;

		return JSON.parse(viewInfoRecord.last_event);
	}
}
