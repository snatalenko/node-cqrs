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
	isObservableQueueProvider
} from './interfaces/index.ts';
import {
	assertArray,
	assertDefined,
	assertObservable,
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
		assertDefined(eventStorageReader, 'eventStorageReader');
		assertDefined(identifierProvider, 'identifierProvider');
		assertObservable(eventBus, 'eventBus');

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
			logger.child({ service: new.target.name }) :
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
		assertArray(eventTypes, 'eventTypes');

		this.#logger?.debug(`retrieving ${eventTypes.join(', ')} events...`);

		const eventsIterable = await this.#eventStorageReader.getEventsByTypes(eventTypes, options);

		yield* eventsIterable;

		this.#logger?.debug(`${eventTypes.join(', ')} events retrieved`);
	}

	/** Retrieve all events of specific Aggregate */
	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		assertDefined(aggregateId, 'aggregateId');

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
		assertDefined(sagaId, 'sagaId');
		assertDefined(filter?.beforeEvent?.id, 'filter.beforeEvent.id');

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
		assertArray(events, 'events');

		return this.#eventDispatcher.dispatch(events, { origin: 'internal' });
	}

	on(messageType: string, handler: IMessageHandler) {
		this.eventBus.on(messageType, handler);
	}

	off(messageType: string, handler: IMessageHandler) {
		this.eventBus.off(messageType, handler);
	}

	queue(name: string): IObservable {
		if (!isObservableQueueProvider(this.eventBus))
			throw new Error('Injected eventBus does not support named queues');

		return this.eventBus.queue(name);
	}

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.eventBus, subscribeTo, filter, handler, this.#logger);
	}
}
