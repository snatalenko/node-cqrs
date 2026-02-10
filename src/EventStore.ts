import {
	type IAggregateSnapshotStorage,
	type IEvent,
	type IEventStorageReader,
	type IEventSet,
	type ILogger,
	type IMessageHandler,
	type IObservable,
	type IEventStream,
	type IEventStore,
	type EventQueryAfter,
	type EventQueryBefore,
	type Identifier,
	type IIdentifierProvider,
	type IEventDispatcher,
	type IEventBus,
	type IContainer,
	type AggregateEventsQueryParams,
	isIdentifierProvider,
	isIEventBus,
	isIEventStorageReader,
	isEventSet,
	isIObservableQueueProvider
} from './interfaces/index.ts';
import {
	getClassName,
	parseSagaId,
	setupOneTimeEmitterSubscription
} from './utils/index.ts';
import { EventDispatcher } from './EventDispatcher.ts';

export class EventStore implements IEventStore {

	#identifierProvider: IIdentifierProvider;
	#eventStorageReader: IEventStorageReader;
	#snapshotStorage: IAggregateSnapshotStorage | undefined;
	eventBus: IEventBus;
	#eventDispatcher: IEventDispatcher;
	#logger?: ILogger;

	constructor({
		eventStorageReader,
		identifierProvider = isIdentifierProvider(eventStorageReader) ? eventStorageReader : undefined,
		snapshotStorage,
		eventBus,
		eventDispatcher,
		eventDispatchPipeline,
		eventDispatchPipelines,
		logger
	}: Pick<IContainer,
		'identifierProvider' |
		'eventStorageReader' |
		'snapshotStorage' |
		'eventBus' |
		'eventDispatcher' |
		'logger' |
		'eventDispatchPipeline' |
		'eventDispatchPipelines'
	>) {
		if (!eventStorageReader)
			throw new TypeError('eventStorageReader argument required');
		if (!identifierProvider)
			throw new TypeError('identifierProvider argument required');
		if (!isIEventStorageReader(eventStorageReader))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (eventBus && !isIEventBus(eventBus))
			throw new TypeError('eventBus does not implement IMessageBus interface');

		this.#eventStorageReader = eventStorageReader;
		this.#identifierProvider = identifierProvider;
		this.#snapshotStorage = snapshotStorage;
		this.#eventDispatcher = eventDispatcher ?? new EventDispatcher({
			eventBus,
			eventDispatchPipeline,
			eventDispatchPipelines
		});
		this.eventBus = eventBus ?? this.#eventDispatcher.eventBus;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
	}

	/**
	 * Generates and returns a new unique identifier using the configured identifier provider.
	 *
	 * @returns A promise resolving to a unique identifier suitable for aggregates, sagas, and events.
	 */
	async getNewId(): Promise<Identifier> {
		return this.#identifierProvider.getNewId();
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream {
		if (!Array.isArray(eventTypes))
			throw new TypeError('eventTypes argument must be an Array');

		this.#logger?.debug(`retrieving ${eventTypes.join(', ')} events...`);

		const eventsIterable = await this.#eventStorageReader.getEventsByTypes(eventTypes, options);

		yield* eventsIterable;

		this.#logger?.debug(`${eventTypes.join(', ')} events retrieved`);
	}

	/** Retrieve all events of specific Aggregate */
	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		if (!aggregateId)
			throw new TypeError('aggregateId argument required');

		this.#logger?.debug(`retrieving event stream for aggregate ${aggregateId}...`);

		// Get snapshot from snapshot storage if not provided in options
		let snapshot = options?.snapshot;
		if (!snapshot && this.#snapshotStorage)
			snapshot = await this.#snapshotStorage.getAggregateSnapshot(aggregateId);

		if (snapshot)
			yield snapshot;

		const eventsIterable = await this.#eventStorageReader.getAggregateEvents(aggregateId, {
			...options,
			snapshot
		});

		yield* eventsIterable;

		this.#logger?.debug(`all events for aggregate ${aggregateId} retrieved`);
	}

	/** Retrieve events of specific Saga */
	async* getSagaEvents(sagaId: Identifier, filter: EventQueryBefore) {
		if (!sagaId)
			throw new TypeError('sagaId argument required');
		if (!filter)
			throw new TypeError('filter argument required');
		if (!filter.beforeEvent)
			throw new TypeError('filter.beforeEvent argument required');
		if (typeof filter.beforeEvent.id !== 'string' || !filter.beforeEvent.id.length)
			throw new TypeError('filter.beforeEvent.id argument required');

		const { sagaDescriptor, originEventId } = parseSagaId(sagaId);
		if (filter.beforeEvent.sagaOrigins?.[sagaDescriptor] !== originEventId)
			throw new TypeError('filter.beforeEvent.sagaOrigins does not match sagaId');

		this.#logger?.debug(`retrieving event stream for saga ${sagaId} before event ${filter.beforeEvent.id}...`);

		const eventsIterable = await this.#eventStorageReader.getSagaEvents(sagaId, filter);

		yield* eventsIterable;

		this.#logger?.debug(`all events for saga ${sagaId} retrieved`);
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param events - a set of events to commit
	 * @returns Signed and committed events
	 */
	async dispatch(events: IEventSet): Promise<IEventSet> {
		if (!isEventSet(events) || events.length === 0)
			throw new TypeError('dispatch requires a non-empty array of events');

		return this.#eventDispatcher.dispatch(events, { origin: 'internal' });
	}

	on(messageType: string, handler: IMessageHandler) {
		this.eventBus.on(messageType, handler);
	}

	off(messageType: string, handler: IMessageHandler) {
		this.eventBus.off(messageType, handler);
	}

	queue(name: string): IObservable {
		if (!isIObservableQueueProvider(this.eventBus))
			throw new Error('Injected eventBus does not support named queues');

		return this.eventBus.queue(name);
	}

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.eventBus, subscribeTo, filter, handler, this.#logger);
	}
}
