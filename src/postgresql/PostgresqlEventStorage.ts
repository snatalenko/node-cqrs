import { randomUUID } from 'node:crypto';
import type { IContainer } from 'node-cqrs';
import {
	type AggregateEventsQueryParams,
	type DispatchPipelineBatch,
	type DispatchPipelineEnvelope,
	type EventQueryAfter,
	type IDispatchPipelineProcessor,
	type IEvent,
	type IEventDispatcher,
	type EventFeedParams,
	type IEventFeed,
	type IEventMeta,
	type IEventSet,
	type IEventStorageReader,
	type IEventStream,
	type IIdentifierProvider,
	type ILogger,
	type Identifier,
	DEFAULT_EVENT_FEED_ORIGIN
} from '../interfaces/index.ts';
import { ConcurrencyError } from '../errors/index.ts';
import { assertFunction, assertNonNegativeInteger, assertPositiveInteger, assertString, parseSagaId } from '../utils/index.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import type { PostgresqlConnection, PostgresqlListenerConnection } from './PostgresqlConnection.ts';
import { registerExitCleanup } from '../shared/registerExitCleanup.ts';
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
	tx_id: string;
	position: string | number;
};

type FeedRow = EventRow & {
	tx_id: string;
};

/** Position in the events table ordered by committing transaction id, then by insert position */
type FeedCursor = {
	txId: string;
	position: string;
};

/** State of a started event feed; a new one is created on each start, so callbacks of a stopped feed can tell */
type FeedSession = {
	eventDispatcher: IEventDispatcher;
	cursor: FeedCursor;

	/** Whether a wake-up arrived since the current read started, so the next read starts without waiting */
	woken: boolean;

	/** Ends the current wait between reads */
	wakeUp?: () => void;
	running?: Promise<void>;
};

/** Groups rows by committing transaction, keeping the order in which transactions first appear */
function groupByTransaction(rows: FeedRow[]): FeedRow[][] {
	const groups = new Map<string, FeedRow[]>();
	for (const row of rows) {
		const group = groups.get(row.tx_id);
		if (group)
			group.push(row);
		else
			groups.set(row.tx_id, [row]);
	}

	return [...groups.values()];
}

/** Starts the next feed read now, or right after the current one */
function wakeFeed(feed: FeedSession) {
	feed.woken = true;
	feed.wakeUp?.();
}

type PostgresqlError = Error & {
	code?: string;
	constraint?: string;
};

function extractMeta(envelope: DispatchPipelineEnvelope): Record<string, unknown> | null {
	const { event: _event, ignoreConcurrencyError: _ignore, otelSpan: _otelSpan, ...rest } = envelope;
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

/**
 * PostgreSQL event storage.
 *
 * When registered as an event feed, dispatches events committed by other storage instances sharing the events table,
 * in commit order, polling the table and waking up on notifications sent with each commit:
 *
 * @example
 * builder.registerEventFeed(PostgresqlEventStorage).as('eventStorage').as('identifierProvider');
 */
export class PostgresqlEventStorage extends AbstractPostgresqlAccessor implements
	IEventStorageReader,
	IIdentifierProvider,
	IDispatchPipelineProcessor,
	IEventFeed {

	static readonly EVENTS_TABLE = 'tbl_events';
	static readonly EVENT_SAGAS_TABLE = 'tbl_event_sagas';

	/** Default interval of event feed reads without notifications, in milliseconds */
	static DEFAULT_FEED_POLL_INTERVAL = 1_000;

	/** Default maximum number of events read by the event feed at once */
	static DEFAULT_FEED_BATCH_SIZE = 500;

	readonly #eventsTableName: string;
	readonly #eventSagasTableName: string;
	readonly #aggregateVersionIndexName: string;
	readonly #channel: string;
	readonly #feedPollInterval: number;
	readonly #feedBatchSize: number;
	readonly #listenerFactory: (() => Promise<PostgresqlListenerConnection> | PostgresqlListenerConnection) | undefined;
	readonly #feedOrigin: string;
	readonly #getEventDispatcher: () => IEventDispatcher | undefined;
	readonly #process: NodeJS.Process | undefined;
	readonly #logger: ILogger | undefined;

	/** IDs of events committed by this instance while the feed runs, not yet passed by the feed */
	readonly #ownEventIds = new Set<string>();
	#feed: FeedSession | undefined;
	#listener: PostgresqlListenerConnection | undefined;
	#listenerRetryTimer: ReturnType<typeof setTimeout> | undefined;
	#exitCleanup: { dispose(): void } | undefined;

	constructor({
		postgresqlEventStorageConfig,
		eventStoragePostgresqlDb,
		eventStoragePostgresqlDbFactory,
		eventStoragePostgresqlListenerFactory,
		postgresqlEventFeedConfig,
		eventFeedOrigin = DEFAULT_EVENT_FEED_ORIGIN,
		get,
		logger,
		process
	}: Partial<Pick<
		IContainer,
		'postgresqlEventStorageConfig' |
		'eventStoragePostgresqlDb' |
		'eventStoragePostgresqlDbFactory' |
		'eventStoragePostgresqlListenerFactory' |
		'postgresqlEventFeedConfig' |
		'logger' |
		'process' |
		'get'
	>> & EventFeedParams) {
		assertFunction(get, 'get');

		super({
			postgreSqlDb: eventStoragePostgresqlDb,
			postgreSqlDbFactory: eventStoragePostgresqlDbFactory
		});

		const eventsTableName = postgresqlEventStorageConfig?.eventsTableName ?? PostgresqlEventStorage.EVENTS_TABLE;
		const eventSagasTableName = postgresqlEventStorageConfig?.eventSagasTableName ??
			PostgresqlEventStorage.EVENT_SAGAS_TABLE;
		assertString(eventsTableName, 'postgresqlEventStorageConfig.eventsTableName');
		assertString(eventSagasTableName, 'postgresqlEventStorageConfig.eventSagasTableName');
		assertString(eventFeedOrigin, 'eventFeedOrigin');

		const quotedEventsTableName = quoteIdentifier(eventsTableName);
		const {
			channel = `${indexPrefix(quotedEventsTableName)}_committed`,
			pollInterval = PostgresqlEventStorage.DEFAULT_FEED_POLL_INTERVAL,
			batchSize = PostgresqlEventStorage.DEFAULT_FEED_BATCH_SIZE
		} = postgresqlEventFeedConfig ?? {};
		assertString(channel, 'postgresqlEventFeedConfig.channel');
		assertNonNegativeInteger(pollInterval, 'postgresqlEventFeedConfig.pollInterval');
		assertPositiveInteger(batchSize, 'postgresqlEventFeedConfig.batchSize');

		this.#eventsTableName = quotedEventsTableName;
		this.#eventSagasTableName = quoteIdentifier(eventSagasTableName);
		this.#aggregateVersionIndexName = `${indexPrefix(this.#eventsTableName)}_aggregate_version_unique_idx`;
		this.#channel = channel;
		this.#feedPollInterval = pollInterval;
		this.#feedBatchSize = batchSize;
		this.#listenerFactory = eventStoragePostgresqlListenerFactory;
		this.#feedOrigin = eventFeedOrigin;

		// resolved lazily, since the storage is also a processor of the dispatcher pipelines
		this.#getEventDispatcher = () => get('eventDispatcher') as IEventDispatcher | undefined;
		this.#process = process;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: new.target.name }) :
			logger;
	}

	protected override async initialize(db: PostgresqlConnection) {
		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#eventsTableName} (
				position BIGSERIAL PRIMARY KEY,
				tx_id XID8 NOT NULL DEFAULT pg_current_xact_id(),
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
			CREATE INDEX IF NOT EXISTS "${eventsIndexPrefix}_tx_id_position_idx"
			ON ${this.#eventsTableName} (tx_id, position)
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
		// While the feed runs, own events are recorded before they are committed,
		// so the feed never reads one of them before it is known to be own
		const ownEventIds = this.#feed ? this.#ownEventIds : undefined;
		const recordedIds: string[] = [];
		try {
			await this.runInTransaction(async () => {
				const metaJson = options?.meta ? JSON.stringify(options.meta) : null;
				for (const event of events) {
					const { sagaOrigins, id, ...eventData } = event;
					const eventId = id ?? this.getNewId();
					assertString(eventId, 'event.id');
					(event as IEvent).id = eventId;

					if (ownEventIds && !ownEventIds.has(eventId)) {
						ownEventIds.add(eventId);
						recordedIds.push(eventId);
					}

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

				// delivered on commit, waking up event feeds of other instances
				await this.connection.query('SELECT pg_notify($1, \'\')', [this.#channel]);
			});
		}
		catch (error) {
			for (const eventId of recordedIds)
				ownEventIds?.delete(eventId);

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

		// Events are read in commit order. Reads after a checkpoint event only return events of transactions
		// completed before the read, since transactions still open can commit events ordered before the ones returned,
		// and a checkpoint taken from those would skip them. Rows of the reading transaction itself stay visible.
		let cursor: PositionRow | undefined;
		if (lastEventId) {
			const row = await this.connection.query<PositionRow>(`
				SELECT tx_id, position
				FROM ${this.#eventsTableName}
				WHERE id = $1
			`, [lastEventId]);

			if (!row.rows.length)
				return;

			cursor = row.rows[0];
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
			WHERE e.type = ANY($1::text[])
				AND (
					$2::xid8 IS NULL
					OR (
						(e.tx_id, e.position) > ($2::xid8, $3::bigint)
						AND (
							e.tx_id < pg_snapshot_xmin(pg_current_snapshot())
							OR e.tx_id = pg_current_xact_id_if_assigned()
						)
					)
				)
			GROUP BY e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.position, e.tx_id
			ORDER BY e.tx_id, e.position
		`, [eventTypes, cursor?.tx_id ?? null, cursor?.position ?? null]);

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

	/**
	 * Starts dispatching events committed by other instances, in commit order, with the feed origin.
	 * Delivery starts from the commit horizon: events of transactions still open at that point are delivered,
	 * events of transactions completed before it are not.
	 */
	async startEventFeed(): Promise<void> {
		if (this.#feed)
			return;

		await this.assertConnection();
		const eventDispatcher = this.#getEventDispatcher();
		if (!eventDispatcher)
			throw new Error('eventDispatcher is required to start the event feed');

		// assigned before the start cursor is taken, so commits from now on are recorded as own
		const feed: FeedSession = { eventDispatcher, cursor: { txId: '0', position: '0' }, woken: false };
		this.#feed = feed;
		try {
			feed.cursor = await this.#getFeedStartCursor();
		}
		catch (error) {
			this.#feed = undefined;
			throw error;
		}

		await this.#listen(feed);
		feed.running = this.#runFeed(feed);
		this.#exitCleanup = registerExitCleanup(this.#process, () => this.stopEventFeed());
	}

	/** Stops delivering events, waits for the current read and closes the listener connection */
	async stopEventFeed(): Promise<void> {
		const feed = this.#feed;
		if (!feed)
			return;

		this.#feed = undefined;
		this.#exitCleanup?.dispose();
		this.#exitCleanup = undefined;
		clearTimeout(this.#listenerRetryTimer);
		this.#listenerRetryTimer = undefined;

		wakeFeed(feed);
		await feed.running;
		await this.#closeListener();
		this.#ownEventIds.clear();
	}

	/** Reads new events, then waits for a wake-up or the poll interval, until the feed is stopped */
	async #runFeed(feed: FeedSession) {
		while (this.#feed === feed) {
			feed.woken = false;
			await this.#readFeed(feed);
			if (!feed.woken)
				await this.#waitForWakeUp(feed);
		}
	}

	#waitForWakeUp(feed: FeedSession): Promise<void> {
		return new Promise(resolve => {
			const timer = setTimeout(resolve, this.#feedPollInterval);
			timer.unref?.();
			feed.wakeUp = () => {
				clearTimeout(timer);
				resolve();
			};
		});
	}

	/**
	 * Reads and dispatches batches of new events until a batch is not full.
	 * The cursor moves past a batch once it is dispatched, so a failed batch is read again on the next wake-up.
	 */
	async #readFeed(feed: FeedSession) {
		try {
			while (this.#feed === feed) {
				const rows = await this.#readFeedBatch(feed.cursor, this.#feedBatchSize);
				if (!rows.length || this.#feed !== feed)
					return;

				await this.#deliverFeedRows(rows, feed.eventDispatcher);
				const last = rows[rows.length - 1];
				feed.cursor = { txId: last.tx_id, position: String(last.position) };

				if (rows.length < this.#feedBatchSize)
					return;
			}
		}
		catch (error) {
			this.#logger?.error('event feed read failed, retrying', { error });
		}
	}

	async #getFeedStartCursor(): Promise<FeedCursor> {
		const result = await this.connection.query<{ tx_id: string }>(
			'SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS tx_id'
		);

		return { txId: result.rows[0].tx_id, position: '0' };
	}

	async #readFeedBatch(cursor: FeedCursor, limit: number): Promise<FeedRow[]> {
		const result = await this.connection.query<FeedRow>(`
			SELECT
				e.id,
				e.aggregate_id,
				e.aggregate_version,
				e.type,
				e.data,
				e.meta,
				e.position,
				e.tx_id::text AS tx_id,
				jsonb_object_agg(sr.saga_descriptor, sr.origin_id)
					FILTER (WHERE sr.saga_descriptor IS NOT NULL) AS saga_origins
			FROM ${this.#eventsTableName} e
			LEFT JOIN ${this.#eventSagasTableName} sr
				ON sr.event_id = e.id
			WHERE (e.tx_id, e.position) > ($1::xid8, $2::bigint)
				AND e.tx_id < pg_snapshot_xmin(pg_current_snapshot())
			GROUP BY e.id, e.aggregate_id, e.aggregate_version, e.type, e.data, e.meta, e.position, e.tx_id
			ORDER BY e.tx_id, e.position
			LIMIT $3
		`, [cursor.txId, cursor.position, limit]);

		return result.rows;
	}

	/**
	 * Dispatches events of other instances in commit order.
	 * Events of one transaction are dispatched together, as on the committing instance, since they share meta.
	 */
	async #deliverFeedRows(rows: FeedRow[], eventDispatcher: IEventDispatcher): Promise<void> {
		const otherInstanceRows = rows.filter(row => !this.#ownEventIds.has(row.id));

		for (const transactionRows of groupByTransaction(otherInstanceRows))
			await this.#dispatchTransaction(transactionRows, eventDispatcher);

		// own event ids are kept until the rows are delivered, since rows of a failed delivery are read again
		for (const row of rows)
			this.#ownEventIds.delete(row.id);
	}

	async #dispatchTransaction(rows: FeedRow[], eventDispatcher: IEventDispatcher) {
		// spans of other processes are not restored, since they are stored as plain objects
		const { otelSpan: _otelSpan, ...meta } = (parseJson(rows[0].meta) ?? {}) as IEventMeta;
		await eventDispatcher.dispatch(rows.map(reconstructEvent), {
			...meta,
			origin: this.#feedOrigin
		});
	}

	/** Listens for notifications on a dedicated connection, when a listener factory is configured */
	async #listen(feed: FeedSession): Promise<void> {
		if (!this.#listenerFactory || this.#feed !== feed)
			return;

		let listener: PostgresqlListenerConnection | undefined;
		try {
			listener = await this.#listenerFactory();
			listener.on('notification', () => wakeFeed(feed));
			listener.on('error', error => {
				this.#logger?.warn('event feed listener connection failed, reconnecting', { error });
				this.#retryListen(feed, listener!);
			});

			await listener.query(`LISTEN ${quoteIdentifier(this.#channel)}`);

			if (this.#feed !== feed) {
				await listener.end();
				return;
			}

			this.#listener = listener;

			// events committed while the listener was connecting did not wake the feed
			wakeFeed(feed);
		}
		catch (error) {
			this.#logger?.warn('event feed listener could not connect, polling meanwhile', { error });
			if (listener)
				this.#retryListen(feed, listener);
			else
				this.#scheduleListen(feed);
		}
	}

	#retryListen(feed: FeedSession, failed: PostgresqlListenerConnection) {
		if (this.#listener === failed)
			this.#listener = undefined;

		failed.end().catch(() => { });
		this.#scheduleListen(feed);
	}

	#scheduleListen(feed: FeedSession) {
		if (this.#feed !== feed || this.#listenerRetryTimer)
			return;

		this.#listenerRetryTimer = setTimeout(() => {
			this.#listenerRetryTimer = undefined;
			this.#listen(feed);
		}, this.#feedPollInterval);
		this.#listenerRetryTimer.unref?.();
	}

	async #closeListener() {
		const listener = this.#listener;
		this.#listener = undefined;
		try {
			await listener?.end();
		}
		catch (error) {
			this.#logger?.warn('event feed listener connection could not be closed', { error });
		}
	}

	private isAggregateVersionUniqueViolation(error: unknown): error is PostgresqlError {
		return typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as PostgresqlError).code === '23505' &&
			(error as PostgresqlError).constraint === this.#aggregateVersionIndexName;
	}
}
