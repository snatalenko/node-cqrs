import { randomUUID } from 'node:crypto';
import type { IContainer } from 'node-cqrs';
import type {
	AggregateEventsQueryParams,
	DispatchPipelineBatch,
	DispatchPipelineEnvelope,
	EventQueryAfter,
	IDispatchPipelineProcessor,
	IEvent,
	IEventSet,
	IEventStorageReader,
	IEventStream,
	IIdentifierProvider,
	Identifier
} from '../interfaces/index.ts';
import { ConcurrencyError } from '../errors/index.ts';
import { assertString, parseSagaId } from '../utils/index.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';
import { quoteIdentifier } from './utils/index.ts';

type EventRow = {
	id: string;
	aggregate_id: string | null;
	aggregate_version: number | null;
	type: string;
	data: unknown;
	meta: unknown;
	position: string | number;
	saga_origins: unknown | null;
};

type SagaEventRow = {
	origin_position: string | number | null;
	before_position: string | number | null;
	id: string | null;
	aggregate_id: string | null;
	aggregate_version: number | null;
	type: string | null;
	data: unknown;
	meta: unknown;
	position: string | number | null;
	saga_origins: unknown | null;
};

type PositionRow = {
	position: string | number;
};

type PostgresqlError = Error & {
	code?: string;
	constraint?: string;
};

function extractMeta(envelope: DispatchPipelineEnvelope): Record<string, unknown> | null {
	const { event: _event, ignoreConcurrencyError: _ignore, ...rest } = envelope;
	if (Object.keys(rest).length === 0)
		return null;

	return rest;
}

function parseJson(value: unknown): unknown {
	if (typeof value !== 'string')
		return value;

	return JSON.parse(value);
}

function indexPrefix(tableName: string): string {
	return tableName.replaceAll('"', '').replaceAll('.', '_');
}

function reconstructEvent(row: EventRow): Readonly<IEvent> {
	const data = parseJson(row.data) as Omit<IEvent, 'id' | 'sagaOrigins'>;
	const event: IEvent = {
		id: row.id,
		...data
	};

	if (row.saga_origins)
		event.sagaOrigins = parseJson(row.saga_origins) as Record<string, string>;

	return event;
}

export class PostgresqlEventStorage extends AbstractPostgresqlAccessor implements
	IEventStorageReader,
	IIdentifierProvider,
	IDispatchPipelineProcessor {

	static readonly EVENTS_TABLE = 'tbl_events';
	static readonly EVENT_SAGAS_TABLE = 'tbl_event_sagas';

	readonly #eventsTableName: string;
	readonly #eventSagasTableName: string;
	readonly #aggregateVersionIndexName: string;

	constructor({
		postgresqlEventStorageConfig,
		viewModelPostgresqlDb,
		viewModelPostgresqlDbFactory
	}: Partial<Pick<
		IContainer,
		'postgresqlEventStorageConfig' |
		'viewModelPostgresqlDb' |
		'viewModelPostgresqlDbFactory'
	>>) {
		super({ viewModelPostgresqlDb, viewModelPostgresqlDbFactory });

		const eventsTableName = postgresqlEventStorageConfig?.eventsTableName ?? PostgresqlEventStorage.EVENTS_TABLE;
		const eventSagasTableName = postgresqlEventStorageConfig?.eventSagasTableName ??
			PostgresqlEventStorage.EVENT_SAGAS_TABLE;
		assertString(eventsTableName, 'postgresqlEventStorageConfig.eventsTableName');
		assertString(eventSagasTableName, 'postgresqlEventStorageConfig.eventSagasTableName');

		this.#eventsTableName = quoteIdentifier(eventsTableName);
		this.#eventSagasTableName = quoteIdentifier(eventSagasTableName);
		this.#aggregateVersionIndexName = `${indexPrefix(this.#eventsTableName)}_aggregate_version_unique_idx`;
	}

	protected override async initialize(db: PostgresqlConnection) {
		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#eventsTableName} (
				position BIGSERIAL PRIMARY KEY,
				id TEXT NOT NULL UNIQUE,
				aggregate_id TEXT,
				aggregate_version INTEGER,
				type TEXT NOT NULL,
				data JSONB NOT NULL,
				meta JSONB,
				check_concurrency BOOLEAN NOT NULL DEFAULT TRUE
			)
		`);

		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#eventSagasTableName} (
				saga_descriptor TEXT NOT NULL,
				origin_id TEXT NOT NULL,
				event_id TEXT NOT NULL,
				PRIMARY KEY (saga_descriptor, origin_id, event_id),
				FOREIGN KEY (event_id) REFERENCES ${this.#eventsTableName}(id) ON DELETE CASCADE
			)
		`);

		const eventsIndexPrefix = indexPrefix(this.#eventsTableName);
		const sagasIndexPrefix = indexPrefix(this.#eventSagasTableName);

		await db.query(`
			CREATE INDEX IF NOT EXISTS "${eventsIndexPrefix}_aggregate_id_idx"
			ON ${this.#eventsTableName} (aggregate_id, aggregate_version)
		`);

		// Only checked rows participate in aggregate-version uniqueness, so ignoreConcurrencyError can opt out.
		await db.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "${this.#aggregateVersionIndexName}"
			ON ${this.#eventsTableName} (aggregate_id, aggregate_version)
			WHERE check_concurrency
				AND aggregate_id IS NOT NULL
				AND aggregate_version IS NOT NULL
		`);

		await db.query(`
			CREATE INDEX IF NOT EXISTS "${eventsIndexPrefix}_type_position_idx"
			ON ${this.#eventsTableName} (type, position)
		`);

		await db.query(`
			CREATE INDEX IF NOT EXISTS "${sagasIndexPrefix}_event_id_idx"
			ON ${this.#eventSagasTableName} (event_id)
		`);
	}

	// eslint-disable-next-line class-methods-use-this
	getNewId(): string {
		return randomUUID().replaceAll('-', '');
	}

	async commitEvents(events: IEventSet, options?: {
		ignoreConcurrencyError?: boolean;
		meta?: Record<string, unknown> | null;
	}): Promise<IEventSet> {
		try {
			await this.runInTransaction(async () => {
				const metaJson = options?.meta ? JSON.stringify(options.meta) : null;
				for (const event of events) {
					const { sagaOrigins, id, ...eventData } = event;
					const eventId = id ?? this.getNewId();
					assertString(eventId, 'event.id');
					(event as IEvent).id = eventId;

					await this.connection.query(`
						INSERT INTO ${this.#eventsTableName} (
							id,
							aggregate_id,
							aggregate_version,
							type,
							data,
							meta,
							check_concurrency
						)
						VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
					`, [
						eventId,
						event.aggregateId !== undefined ? String(event.aggregateId) : null,
						event.aggregateVersion ?? null,
						event.type,
						JSON.stringify(eventData),
						metaJson,
						!options?.ignoreConcurrencyError
					]);

					if (sagaOrigins) {
						for (const [descriptor, originId] of Object.entries(sagaOrigins)) {
							await this.connection.query(`
								INSERT INTO ${this.#eventSagasTableName} (
									saga_descriptor,
									origin_id,
									event_id
								)
								VALUES ($1, $2, $3)
							`, [descriptor, String(originId), eventId]);
						}
					}
				}
			});
		}
		catch (error) {
			if (this.isAggregateVersionUniqueViolation(error))
				throw new ConcurrencyError('Concurrency conflict: duplicate event version', { cause: error });

			throw error;
		}

		return events;
	}

	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		await this.assertConnection();

		const rows = await this.connection.query<EventRow>(`
			WITH tail AS (
				SELECT id AS tail_id
				FROM ${this.#eventsTableName}
				WHERE aggregate_id = $1
					AND ($2::integer IS NULL OR aggregate_version > $2)
				ORDER BY position DESC
				LIMIT 1
			)
			SELECT
				e.id,
				e.aggregate_id,
				e.aggregate_version,
				e.type,
				e.data,
				e.meta,
				e.position,
				jsonb_object_agg(sr.saga_descriptor, sr.origin_id)
					FILTER (WHERE sr.saga_descriptor IS NOT NULL) AS saga_origins
			FROM ${this.#eventsTableName} e
			LEFT JOIN tail ON TRUE
			LEFT JOIN ${this.#eventSagasTableName} sr
				ON sr.event_id = e.id
			WHERE e.aggregate_id = $1
				AND ($2::integer IS NULL OR e.aggregate_version > $2)
				AND (
					$3::text[] IS NULL
					OR e.type = ANY($3::text[])
					OR ($4 = 'last' AND e.id = tail.tail_id)
				)
			GROUP BY e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.position
			ORDER BY e.position
		`, [
			String(aggregateId),
			options?.snapshot?.aggregateVersion ?? null,
			options?.eventTypes ?? null,
			options?.tail ?? null
		]);

		for (const row of rows.rows)
			yield reconstructEvent(row);
	}

	async* getSagaEvents(sagaId: Identifier, { beforeEvent }: { beforeEvent: IEvent }): IEventStream {
		await this.assertConnection();

		assertString(beforeEvent?.id, 'beforeEvent.id');

		const { sagaDescriptor, originEventId } = parseSagaId(sagaId);
		if (beforeEvent.sagaOrigins?.[sagaDescriptor] !== originEventId)
			throw new TypeError('beforeEvent.sagaOrigins does not match sagaId');

		const rows = await this.connection.query<SagaEventRow>(`
			WITH bounds AS (
				SELECT
					(SELECT position FROM ${this.#eventsTableName} WHERE id = $2) AS origin_position,
					(SELECT position FROM ${this.#eventsTableName} WHERE id = $3) AS before_position
			)
			SELECT
				b.origin_position,
				b.before_position,
				e.id,
				e.aggregate_id,
				e.aggregate_version,
				e.type,
				e.data,
				e.meta,
				e.position,
				e.saga_origins
			FROM bounds b
			LEFT JOIN LATERAL (
				SELECT
					e.id,
					e.aggregate_id,
					e.aggregate_version,
					e.type,
					e.data,
					e.meta,
					e.position,
					jsonb_object_agg(sr.saga_descriptor, sr.origin_id)
						FILTER (WHERE sr.saga_descriptor IS NOT NULL) AS saga_origins
				FROM ${this.#eventsTableName} e
				LEFT JOIN ${this.#eventSagasTableName} filter_sr
					ON filter_sr.event_id = e.id
					AND filter_sr.saga_descriptor = $1
					AND filter_sr.origin_id = $2
				LEFT JOIN ${this.#eventSagasTableName} sr
					ON sr.event_id = e.id
				WHERE b.origin_position IS NOT NULL
					AND b.before_position IS NOT NULL
					AND e.position >= b.origin_position
					AND e.position < b.before_position
					AND (e.id = $2 OR filter_sr.event_id IS NOT NULL)
				GROUP BY e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.position
				ORDER BY e.position
			) e ON TRUE
			ORDER BY e.position
		`, [sagaDescriptor, originEventId, beforeEvent.id]);

		const bounds = rows.rows[0];
		if (!bounds?.origin_position)
			throw new Error(`origin event ${originEventId} not found`);

		if (!bounds.before_position)
			throw new Error(`beforeEvent ${beforeEvent.id} not found`);

		for (const row of rows.rows) {
			if (row.id)
				yield reconstructEvent(row as EventRow);
		}
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream {
		await this.assertConnection();

		const lastEventId = options?.afterEvent?.id;
		if (options?.afterEvent)
			assertString(options.afterEvent.id, 'options.afterEvent.id');

		let afterPosition: string | number = 0;
		if (lastEventId) {
			const row = await this.connection.query<PositionRow>(`
				SELECT position
				FROM ${this.#eventsTableName}
				WHERE id = $1
			`, [lastEventId]);

			if (!row.rows.length)
				return;

			afterPosition = row.rows[0].position;
		}

		const rows = await this.connection.query<EventRow>(`
			SELECT
				e.id,
				e.aggregate_id,
				e.aggregate_version,
				e.type,
				e.data,
				e.meta,
				e.position,
				jsonb_object_agg(sr.saga_descriptor, sr.origin_id)
					FILTER (WHERE sr.saga_descriptor IS NOT NULL) AS saga_origins
			FROM ${this.#eventsTableName} e
			LEFT JOIN ${this.#eventSagasTableName} sr
				ON sr.event_id = e.id
			WHERE e.position > $1
				AND e.type = ANY($2::text[])
			GROUP BY e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.position
			ORDER BY e.position
		`, [afterPosition, eventTypes]);

		for (const row of rows.rows)
			yield reconstructEvent(row);
	}

	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const events: IEvent[] = [];
		for (const item of batch) {
			if (!item.event)
				throw new Error('Event batch does not contain `event`');

			events.push(item.event);
		}

		await this.commitEvents(events, {
			ignoreConcurrencyError: batch[0]?.ignoreConcurrencyError,
			meta: extractMeta(batch[0])
		});

		return batch;
	}

	private isAggregateVersionUniqueViolation(error: unknown): error is PostgresqlError {
		return typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as PostgresqlError).code === '23505' &&
			(error as PostgresqlError).constraint === this.#aggregateVersionIndexName;
	}
}
