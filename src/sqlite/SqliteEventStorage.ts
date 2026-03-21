import { randomUUID } from 'node:crypto';
import type { Statement, Database } from 'better-sqlite3';
import type {
	IIdentifierProvider,
	IEvent,
	IEventSet,
	EventQueryAfter,
	IEventStorageReader,
	IEventStream,
	Identifier,
	IDispatchPipelineProcessor,
	DispatchPipelineBatch,
	DispatchPipelineEnvelope,
	AggregateEventsQueryParams
} from '../interfaces/index.ts';
import { assertString, parseSagaId } from '../utils/index.ts';
import { ConcurrencyError } from '../errors/index.ts';
import { AbstractSqliteAccessor } from './AbstractSqliteAccessor.ts';
import { guid, bufferToGuid } from './utils/index.ts';

type EventRow = {
	id: Buffer;
	aggregate_id: Buffer | null;
	aggregate_version: number | null;
	type: string;
	data: string;
	meta: string | null;
	rowid: number;
};

type SagaRefRow = {
	saga_descriptor: string;
	origin_id: Buffer;
};

type RowidRow = {
	rowid: number;
};

function extractMeta(envelope: DispatchPipelineEnvelope): Record<string, unknown> | null {
	const { event: _event, ignoreConcurrencyError: _ignore, ...rest } = envelope;
	if (Object.keys(rest).length === 0)
		return null;

	return rest;
}

export class SqliteEventStorage extends AbstractSqliteAccessor implements
	IEventStorageReader,
	IIdentifierProvider,
	IDispatchPipelineProcessor {

	#insertEventQuery!: Statement<[Buffer, Buffer | null, number | null, string, string, string | null]>;
	#insertSagaRefQuery!: Statement<[string, Buffer, Buffer]>;
	#checkConcurrencyQuery!: Statement<[Buffer, number], 1 | null>;
	#getRowidQuery!: Statement<[Buffer], RowidRow>;
	#getAggregateEventsQuery!: Statement<[{
		aggregateId: Buffer;
		afterVersion: number | null;
		eventTypes: string | null;
		tail: string | null;
	}], EventRow>;
	#getSagaEventsQuery!: Statement<[{
		sagaDescriptor: string;
		originId: Buffer;
		originRowid: number;
		beforeRowid: number;
	}], EventRow>;
	#getSagaRefsQuery!: Statement<[Buffer], SagaRefRow>;
	#getEventsByTypesQuery!: Statement<[number], EventRow>;

	protected initialize(db: Database) {
		db.pragma('foreign_keys = ON');

		db.exec(`CREATE TABLE IF NOT EXISTS tbl_events (
			id BLOB PRIMARY KEY,
			aggregate_id BLOB,
			aggregate_version INTEGER,
			type TEXT NOT NULL,
			data JSON NOT NULL,
			meta JSON
		)`);

		db.exec(`CREATE TABLE IF NOT EXISTS tbl_event_sagas (
			saga_descriptor TEXT NOT NULL,
			origin_id BLOB NOT NULL,
			event_id BLOB NOT NULL,
			PRIMARY KEY (saga_descriptor, origin_id, event_id),
			FOREIGN KEY (event_id) REFERENCES tbl_events(id)
		)`);

		db.exec('CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON tbl_events (aggregate_id)');
		db.exec('CREATE INDEX IF NOT EXISTS idx_event_sagas_event_id ON tbl_event_sagas (event_id)');

		this.#insertEventQuery = db.prepare(`
			INSERT INTO tbl_events (id, aggregate_id, aggregate_version, type, data, meta)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		this.#insertSagaRefQuery = db.prepare(`
			INSERT INTO tbl_event_sagas (saga_descriptor, origin_id, event_id)
			VALUES (?, ?, ?)
		`);

		this.#checkConcurrencyQuery = db.prepare(`
			SELECT 1 FROM tbl_events
			WHERE aggregate_id = ? AND aggregate_version = ?
			LIMIT 1
		`);

		this.#getRowidQuery = db.prepare(`
			SELECT rowid FROM tbl_events WHERE id = ?
		`);

		this.#getAggregateEventsQuery = db.prepare(`
			WITH tail AS (
				SELECT id AS tail_id
				FROM tbl_events
				WHERE aggregate_id = @aggregateId
					AND (@afterVersion IS NULL OR aggregate_version > @afterVersion)
				ORDER BY rowid DESC
				LIMIT 1
			)
			SELECT e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.rowid
			FROM tbl_events e, tail
			WHERE e.aggregate_id = @aggregateId
				AND (@afterVersion IS NULL OR e.aggregate_version > @afterVersion)
				AND (
					@eventTypes IS NULL
					OR e.type IN (SELECT value FROM json_each(@eventTypes))
					OR (@tail = 'last' AND e.id = tail.tail_id)
				)
			ORDER BY e.rowid
		`);

		this.#getSagaEventsQuery = db.prepare(`
			SELECT e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.rowid
			FROM tbl_events e
			LEFT JOIN tbl_event_sagas sr
				ON sr.event_id = e.id
				AND sr.saga_descriptor = @sagaDescriptor
				AND sr.origin_id = @originId
			WHERE e.rowid >= @originRowid AND e.rowid < @beforeRowid
				AND (e.id = @originId OR sr.event_id IS NOT NULL)
			ORDER BY e.rowid
		`);

		this.#getSagaRefsQuery = db.prepare(`
			SELECT saga_descriptor, origin_id
			FROM tbl_event_sagas
			WHERE event_id = ?
		`);

		this.#getEventsByTypesQuery = db.prepare(`
			SELECT id, aggregate_id, aggregate_version, type, data, meta, rowid
			FROM tbl_events
			WHERE rowid > ?
			ORDER BY rowid
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
		await this.assertConnection();

		const metaJson = options?.meta ? JSON.stringify(options.meta) : null;

		this.db!.transaction(() => {
			for (const event of events) {
				if (!options?.ignoreConcurrencyError && event.aggregateId && event.aggregateVersion !== undefined) {
					const conflict = this.#checkConcurrencyQuery.get(guid(event.aggregateId), event.aggregateVersion);
					if (conflict)
						throw new ConcurrencyError(`Duplicate aggregateVersion ${event.aggregateVersion} for aggregate ${event.aggregateId}`);
				}

				const { sagaOrigins, id, ...eventData } = event;
				assertString(id, 'event.id');
				const eventId = guid(id);

				this.#insertEventQuery.run(
					eventId,
					event.aggregateId !== undefined ? guid(event.aggregateId) : null,
					event.aggregateVersion ?? null,
					event.type,
					JSON.stringify(eventData),
					metaJson
				);

				if (sagaOrigins) {
					for (const [descriptor, originId] of Object.entries(sagaOrigins)) {
						this.#insertSagaRefQuery.run(
							descriptor,
							guid(originId),
							eventId
						);
					}
				}
			}
		})();

		return events;
	}

	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		await this.assertConnection();

		const rows = this.#getAggregateEventsQuery.all({
			aggregateId: guid(aggregateId),
			afterVersion: options?.snapshot?.aggregateVersion ?? null,
			eventTypes: options?.eventTypes
				? JSON.stringify(options.eventTypes)
				: null,
			tail: options?.tail ?? null
		});

		for (const row of rows)
			yield this.#reconstructEvent(row);
	}

	async* getSagaEvents(sagaId: Identifier, { beforeEvent }: { beforeEvent: IEvent }): IEventStream {
		await this.assertConnection();

		assertString(beforeEvent?.id, 'beforeEvent.id');

		const { sagaDescriptor, originEventId } = parseSagaId(sagaId);
		if (beforeEvent.sagaOrigins?.[sagaDescriptor] !== originEventId)
			throw new TypeError('beforeEvent.sagaOrigins does not match sagaId');

		const originRowid = this.#getRowidQuery.get(guid(originEventId));
		if (!originRowid)
			throw new Error(`origin event ${originEventId} not found`);

		const beforeRowid = this.#getRowidQuery.get(guid(beforeEvent.id));
		if (!beforeRowid)
			throw new Error(`beforeEvent ${beforeEvent.id} not found`);

		const rows = this.#getSagaEventsQuery.all({
			sagaDescriptor,
			originId: guid(originEventId),
			originRowid: originRowid.rowid,
			beforeRowid: beforeRowid.rowid
		});

		for (const row of rows)
			yield this.#reconstructEvent(row);
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream {
		await this.assertConnection();

		const lastEventId = options?.afterEvent?.id;
		if (options?.afterEvent)
			assertString(options.afterEvent.id, 'options.afterEvent.id');

		let afterRowid = 0;
		if (lastEventId) {
			const row = this.#getRowidQuery.get(guid(lastEventId));
			if (!row)
				return;

			afterRowid = row.rowid;
		}

		const rows = this.#getEventsByTypesQuery.all(afterRowid);

		for (const row of rows) {
			if (eventTypes.includes(row.type))
				yield this.#reconstructEvent(row);
		}
	}

	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const events: IEvent[] = [];
		for (const item of batch) {
			if (!item.event)
				throw new Error('Event batch does not contain `event`');

			events.push(item.event);
		}

		const meta = extractMeta(batch[0]);
		const ignoreConcurrencyError = batch[0]?.ignoreConcurrencyError;

		await this.commitEvents(events, { ignoreConcurrencyError, meta });

		return batch;
	}

	#getSagaOriginsForEvent(eventIdBuf: Buffer): Record<string, string> {
		const refs = this.#getSagaRefsQuery.all(eventIdBuf);
		if (refs.length === 0)
			return {};

		const sagaOrigins: Record<string, string> = {};
		for (const ref of refs)
			sagaOrigins[ref.saga_descriptor] = bufferToGuid(ref.origin_id);

		return sagaOrigins;
	}

	#reconstructEvent(row: EventRow): Readonly<IEvent> {
		const data = JSON.parse(row.data);
		const sagaOrigins = this.#getSagaOriginsForEvent(row.id);

		const event: IEvent = {
			id: bufferToGuid(row.id),
			...data
		};

		if (Object.keys(sagaOrigins).length > 0)
			event.sagaOrigins = sagaOrigins;

		return event;
	}
}
