import type { IContainer } from 'node-cqrs';
import type { EventTrackerWaitOptions, IEvent, IEventTracker, Identifier } from '../interfaces/index.ts';
import { assertNonNegativeInteger, assertString } from '../utils/assert.ts';
import { EventProgressTracker } from '../utils/EventProgressTracker.ts';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';
import type { PostgresqlProjectionDataParams } from './PostgresqlProjectionDataParams.ts';
import type { PostgresqlViewLockerParams } from './PostgresqlViewLocker.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import { getEventId, quoteIdentifier } from './utils/index.ts';

export type PostgresqlEventLockerParams =
	PostgresqlProjectionDataParams
	& Pick<PostgresqlViewLockerParams, 'viewLockTableName'>
	& {

		/**
		 * (Optional) PostgreSQL table name where event locks are stored.
		 *
		 * @default PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE
		 */
		eventLockTableName?: string;

		/**
		 * (Optional) Time-to-live (TTL) duration in milliseconds
		 * for which an event remains in the "processing" state until released.
		 *
		 * @default PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL
		 */
		eventLockTtl?: number;
	};

/**
 * PostgreSQL-backed implementation of IEventTracker.
 *
 * Uses one table for per-event processing locks and the view lock table for the
 * last processed event checkpoint.
 */
export class PostgresqlEventLocker extends AbstractPostgresqlAccessor implements IEventTracker {

	static DEFAULT_EVENT_LOCK_TTL = 15_000;
	static DEFAULT_EVENT_LOCK_TABLE = 'ncqrs_event_locks';
	static DEFAULT_VIEW_LOCK_TABLE = 'ncqrs_view_locks';

	readonly #projectionName: string;
	readonly #schemaVersion: string;
	readonly #viewLockTableName: string;
	readonly #eventLockTableName: string;
	readonly #eventLockTtl: number;
	readonly #progress = new EventProgressTracker(eventIds => this.#getProjectedEventIds(eventIds));

	constructor(o: Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory'>>
		& PostgresqlEventLockerParams) {
		super(o);

		assertString(o.projectionName, 'o.projectionName');
		assertString(o.schemaVersion, 'o.schemaVersion');
		if (o.viewLockTableName !== undefined)
			assertString(o.viewLockTableName, 'o.viewLockTableName');
		if (o.eventLockTableName !== undefined)
			assertString(o.eventLockTableName, 'o.eventLockTableName');
		if (o.eventLockTtl !== undefined)
			assertNonNegativeInteger(o.eventLockTtl, 'o.eventLockTtl');

		this.#projectionName = o.projectionName;
		this.#schemaVersion = o.schemaVersion;
		this.#viewLockTableName = quoteIdentifier(o.viewLockTableName ?? PostgresqlEventLocker.DEFAULT_VIEW_LOCK_TABLE);
		this.#eventLockTableName = quoteIdentifier(
			o.eventLockTableName ?? PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TABLE
		);
		this.#eventLockTtl = o.eventLockTtl ?? PostgresqlEventLocker.DEFAULT_EVENT_LOCK_TTL;
	}

	protected async initialize(db: PostgresqlConnection): Promise<void> {
		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#viewLockTableName} (
				projection_name text NOT NULL,
				schema_version text NOT NULL,
				locked_till timestamptz NULL,
				lock_token text NULL,
				last_event text NULL,
				PRIMARY KEY (projection_name, schema_version)
			)
		`);

		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#eventLockTableName} (
				projection_name text NOT NULL,
				schema_version text NOT NULL,
				event_id text NOT NULL,
				processing_at timestamptz NOT NULL DEFAULT NOW(),
				processed_at timestamptz NULL,
				PRIMARY KEY (projection_name, schema_version, event_id)
			)
		`);

		await db.query(`
			CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableNameForIndex()}_processing_at_idx`)}
			ON ${this.#eventLockTableName} (processing_at)
		`);
	}

	async tryMarkAsProjecting(event: IEvent): Promise<boolean> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const r = await this.connection.query(`
			INSERT INTO ${this.#eventLockTableName} AS event_lock
				(projection_name, schema_version, event_id, processing_at, processed_at)
			VALUES ($1, $2, $3, NOW(), NULL)
			ON CONFLICT (projection_name, schema_version, event_id)
			DO UPDATE SET
				processing_at = NOW(),
				processed_at = NULL
			WHERE
				event_lock.processed_at IS NULL
				AND event_lock.processing_at <= NOW() - ($4::double precision * INTERVAL '1 millisecond')
		`, [this.#projectionName, this.#schemaVersion, eventId, this.#eventLockTtl]);

		return r.rowCount !== 0;
	}

	async markAsProjected(event: IEvent): Promise<void> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const result = await this.connection.query(`
			UPDATE ${this.#eventLockTableName}
			SET
				processed_at = NOW()
			WHERE
				projection_name = $1
				AND schema_version = $2
				AND event_id = $3
				AND processed_at IS NULL
		`, [this.#projectionName, this.#schemaVersion, eventId]);

		if (result.rowCount !== 1)
			throw new Error(`Event ${event.id} could not be marked as processed`);

		// When projected within a view transaction, changes become visible only once it is committed
		this.afterCommit(() => this.#progress.markAsCompleted(event));
	}

	markAsFailed(event: IEvent, error: unknown) {
		this.#progress.markAsFailed(event, error);
	}

	waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void> {
		return this.#progress.waitFor(eventIds, options);
	}

	async markAsLastEvent(event: IEvent): Promise<void> {
		await this.assertConnection();

		await this.connection.query(`
			INSERT INTO ${this.#viewLockTableName} (projection_name, schema_version, last_event)
			VALUES ($1, $2, $3)
			ON CONFLICT (projection_name, schema_version)
			DO UPDATE SET
				last_event = excluded.last_event
		`, [this.#projectionName, this.#schemaVersion, JSON.stringify(event)]);
	}

	async getLastEvent(): Promise<IEvent | undefined> {
		await this.assertConnection();

		const viewInfoRecord = await this.connection.query<{ last_event: string | null }>(`
			SELECT
				last_event
			FROM ${this.#viewLockTableName}
			WHERE
				projection_name = $1
				AND schema_version = $2
		`, [this.#projectionName, this.#schemaVersion]);
		const lastEvent = viewInfoRecord.rows[0]?.last_event;
		if (!lastEvent)
			return undefined;

		return JSON.parse(lastEvent);
	}

	/** Get IDs of the given events, which are marked as projected by any process */
	async #getProjectedEventIds(eventIds: Identifier[]): Promise<Identifier[]> {
		await this.assertConnection();

		// A single connection running a transaction would expose uncommitted markers, which can still be rolled back.
		// The lookup is skipped then and retried on the next poll
		if (!this.readsCommittedOnly)
			return [];

		const eventIdsByLockKey = new Map(eventIds.map(id => [getEventId({ id } as IEvent), id]));

		// `this.db` is used instead of `this.connection`, since polling outlives the transaction,
		// in which the wait may have been started, and only committed changes need to be observed
		const result = await this.db!.query<{ event_id: string }>(`
			SELECT
				event_id
			FROM ${this.#eventLockTableName}
			WHERE
				projection_name = $1
				AND schema_version = $2
				AND event_id = ANY($3::text[])
				AND processed_at IS NOT NULL
		`, [this.#projectionName, this.#schemaVersion, [...eventIdsByLockKey.keys()]]);

		return result.rows.map(r => eventIdsByLockKey.get(r.event_id)!);
	}

	#tableNameForIndex() {
		return this.#eventLockTableName.replaceAll('"', '').replaceAll('.', '_');
	}
}
