import type { Database, Statement } from 'better-sqlite3';
import type { IContainer } from 'node-cqrs';
import type { EventTrackerWaitOptions, IEvent, IEventTracker, Identifier } from '../interfaces/index.ts';
import { EventProgressTracker } from '../utils/EventProgressTracker.ts';
import { getEventId } from './utils/index.ts';
import { viewLockTableInit, eventLockTableInit } from './queries/index.ts';
import type { SqliteViewLockerParams } from './SqliteViewLocker.ts';
import type { SqliteProjectionDataParams } from './SqliteProjectionDataParams.ts';
import { AbstractSqliteAccessor } from './AbstractSqliteAccessor.ts';
import { assertString } from '../utils/assert.ts';
import { serializeEvent } from '../utils/serializeEvent.ts';

export type SqliteEventLockerParams =
	SqliteProjectionDataParams
	& Pick<SqliteViewLockerParams, 'viewLockTableName'>
	& {

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
	};

/** Named parameters identifying the projection in lock queries */
type ProjectionQueryParams = {
	projectionName: string;
	schemaVersion: string;
};

export class SqliteEventLocker extends AbstractSqliteAccessor implements IEventTracker {

	#projectionName: string;
	#schemaVersion: string;
	#viewLockTableName: string;
	#eventLockTableName: string;
	#eventLockTtl: number;
	readonly #progress = new EventProgressTracker(eventIds => this.#getProjectedEventIds(eventIds));

	#upsertLastEventQuery!: Statement<ProjectionQueryParams & { lastEvent: string }, void>;
	#getLastEventQuery!: Statement<ProjectionQueryParams, { last_event: string }>;
	#lockEventQuery!: Statement<ProjectionQueryParams & { eventId: Buffer, eventLockTtl: number }, void>;
	#finalizeEventLockQuery!: Statement<ProjectionQueryParams & { eventId: Buffer }, void>;
	#getProjectedEventIdsQuery!: Statement<ProjectionQueryParams & { lockKeys: string }, { position: number }>;

	constructor(o: Pick<IContainer, 'viewModelSqliteDb' | 'viewModelSqliteDbFactory'> & SqliteEventLockerParams) {
		super(o);

		assertString(o?.projectionName, 'o.projectionName');
		assertString(o?.schemaVersion, 'o.schemaVersion');

		this.#projectionName = o.projectionName;
		this.#schemaVersion = o.schemaVersion;
		this.#viewLockTableName = o.viewLockTableName ?? 'tbl_view_lock';
		this.#eventLockTableName = o.eventLockTableName ?? 'tbl_event_lock';
		this.#eventLockTtl = o.eventLockTtl ?? 15_000;
	}

	protected initialize(db: Database) {
		db.exec(viewLockTableInit(this.#viewLockTableName));
		db.exec(eventLockTableInit(this.#eventLockTableName));

		this.#upsertLastEventQuery = db.prepare(`
			INSERT INTO ${this.#viewLockTableName} (projection_name, schema_version, last_event)
			VALUES (@projectionName, @schemaVersion, @lastEvent)
			ON CONFLICT (projection_name, schema_version)
			DO UPDATE SET
				last_event = excluded.last_event
		`);

		this.#getLastEventQuery = db.prepare(`
			SELECT
				last_event
			FROM ${this.#viewLockTableName}
			WHERE
				projection_name = @projectionName
				AND schema_version = @schemaVersion
		`);

		this.#lockEventQuery = db.prepare(`
			INSERT INTO ${this.#eventLockTableName} (projection_name, schema_version, event_id)
			VALUES (@projectionName, @schemaVersion, @eventId)
			ON CONFLICT (projection_name, schema_version, event_id)
			DO UPDATE SET
				processing_at = cast(unixepoch('now','subsec') * 1000 as INTEGER)
			WHERE
				processed_at IS NULL
				AND processing_at <= cast(unixepoch('now','subsec') * 1000 as INTEGER) - @eventLockTtl
		`);

		this.#finalizeEventLockQuery = db.prepare(`
			UPDATE ${this.#eventLockTableName}
			SET
				processed_at = cast(unixepoch('now','subsec') * 1000 as INTEGER)
			WHERE
				projection_name = @projectionName
				AND schema_version = @schemaVersion
				AND event_id = @eventId
				AND processed_at IS NULL
		`);

		// Event lock keys are passed as a JSON array of hex strings,
		// positions of the projected ones in the array are returned
		this.#getProjectedEventIdsQuery = db.prepare(`
			SELECT
				lock_key.key AS position
			FROM json_each(@lockKeys) AS lock_key
			JOIN ${this.#eventLockTableName} AS event_lock
				ON event_lock.event_id = unhex(lock_key.value)
			WHERE
				event_lock.projection_name = @projectionName
				AND event_lock.schema_version = @schemaVersion
				AND event_lock.processed_at IS NOT NULL
		`);
	}

	async tryMarkAsProjecting(event: IEvent<any>) {
		const r = await this.runExclusively(() => this.#lockEventQuery.run({
			projectionName: this.#projectionName,
			schemaVersion: this.#schemaVersion,
			eventId: getEventId(event),
			eventLockTtl: this.#eventLockTtl
		}));

		return r.changes !== 0;
	}

	async markAsProjected(event: IEvent<any>) {
		const updateResult = await this.runExclusively(() => this.#finalizeEventLockQuery.run({
			projectionName: this.#projectionName,
			schemaVersion: this.#schemaVersion,
			eventId: getEventId(event)
		}));
		if (updateResult.changes === 0)
			throw new Error(`Event ${event.id} could not be marked as processed`);

		this.afterCommit(() => this.#progress.markAsCompleted(event));
	}

	markAsFailed(event: IEvent, error: unknown) {
		this.#progress.markAsFailed(event, error);
	}

	waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void> {
		return this.#progress.waitFor(eventIds, options);
	}

	async markAsLastEvent(event: IEvent<any>) {
		await this.runExclusively(() => this.#upsertLastEventQuery.run({
			projectionName: this.#projectionName,
			schemaVersion: this.#schemaVersion,
			lastEvent: serializeEvent(event)
		}));
	}

	async getLastEvent(): Promise<IEvent<any> | undefined> {
		const viewInfoRecord = await this.runExclusively(() => this.#getLastEventQuery.get({
			projectionName: this.#projectionName,
			schemaVersion: this.#schemaVersion
		}));
		if (!viewInfoRecord?.last_event)
			return undefined;

		return JSON.parse(viewInfoRecord.last_event);
	}

	/** Get IDs of the given events, which are marked as projected by any process */
	async #getProjectedEventIds(eventIds: Identifier[]): Promise<Identifier[]> {
		const lockKeys = eventIds.map(id => getEventId({ id } as IEvent).toString('hex'));

		const rows = await this.runExclusively(() => this.#getProjectedEventIdsQuery.all({
			projectionName: this.#projectionName,
			schemaVersion: this.#schemaVersion,
			lockKeys: JSON.stringify(lockKeys)
		}));

		return rows.map(r => eventIds[r.position]);
	}
}
