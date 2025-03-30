import {
	IAggregateSnapshotStorage,
	IEvent,
	IEventStoreReader,
	IEventSet,
	IExtendableLogger,
	ILogger,
	IMessageHandler,
	IObservable,
	IEventStream,
	IEventStore,
	EventQueryAfter,
	EventQueryBefore,
	Identifier,
	IIdentifierProvider,
	isIdentifierProvider,
	IEventDispatcher,
	IEventBus,
	isIEventBus,
	isIEventStoreReader
} from "./interfaces";
import {
	getClassName,
	setupOneTimeEmitterSubscription
} from "./utils";
import { EventDispatcher } from "./EventDispatcher";

export class EventStore implements IEventStore {

	#identifierProvider: IIdentifierProvider;
	#storage: IEventStoreReader;
	#snapshotStorage: IAggregateSnapshotStorage | undefined;
	eventBus: IEventBus;
	#eventDispatcher: IEventDispatcher;
	#sagaStarters: Set<string> = new Set();
	#logger?: ILogger;

	constructor({
		storage,
		identifierProvider = isIdentifierProvider(storage) ? storage : undefined,
		snapshotStorage,
		eventBus,
		eventDispatcher,
		logger,
	}: {
		storage: IEventStoreReader,
		identifierProvider?: IIdentifierProvider,
		snapshotStorage?: IAggregateSnapshotStorage,
		eventBus?: IEventBus,
		eventDispatcher?: IEventDispatcher,
		logger?: ILogger | IExtendableLogger,
	}) {
		if (!storage)
			throw new TypeError('storage argument required');
		if (!identifierProvider)
			throw new TypeError('identifierProvider argument required');
		if (!isIEventStoreReader(storage))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (eventBus && !isIEventBus(eventBus))
			throw new TypeError('eventBus does not implement IMessageBus interface');

		this.#storage = storage;
		this.#identifierProvider = identifierProvider;
		this.#snapshotStorage = snapshotStorage;
		this.#eventDispatcher = eventDispatcher ?? new EventDispatcher({ eventBus });
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

		const eventsIterable = await this.#storage.getEventsByTypes(eventTypes, options);

		yield* eventsIterable;

		this.#logger?.debug(`${eventTypes.join(', ')} events retrieved`);
	}

	/** Retrieve all events of specific Aggregate */
	async* getAggregateEvents(aggregateId: Identifier): IEventStream {
		if (!aggregateId)
			throw new TypeError('aggregateId argument required');

		this.#logger?.debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const snapshot = this.#snapshotStorage ?
			await this.#snapshotStorage.getAggregateSnapshot(aggregateId) :
			undefined;

		if (snapshot)
			yield snapshot;

		const eventsIterable = await this.#storage.getAggregateEvents(aggregateId, { snapshot });

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
		if (filter.beforeEvent.sagaVersion === undefined)
			throw new TypeError('filter.beforeEvent.sagaVersion argument required');

		this.#logger?.debug(`retrieving event stream for saga ${sagaId}, v${filter.beforeEvent.sagaVersion}...`);

		const eventsIterable = await this.#storage.getSagaEvents(sagaId, filter);

		yield* eventsIterable;

		this.#logger?.debug(`all events for saga ${sagaId} retrieved`);
	}

	/**
	 * Register event types that start sagas.
	 * Upon such event commit a new sagaId will be assigned
	 */
	registerSagaStarters(eventTypes: string[] = []) {
		for (const eventType of eventTypes)
			this.#sagaStarters.add(eventType);
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param events - a set of events to commit
	 * @returns Signed and committed events
	 */
	async dispatch(events: IEventSet): Promise<IEventSet> {
		if (!Array.isArray(events))
			throw new TypeError('events argument must be an Array');

		const augmentedEvents = await this.#attachSagaIdToSagaStarterEvents(events);

		return this.#eventDispatcher.dispatch(augmentedEvents);
	}

	/**
	 * Generate and attach sagaId to events that start new sagas
	 */
	async #attachSagaIdToSagaStarterEvents(events: IEventSet): Promise<IEventSet> {
		if (!this.#sagaStarters.size)
			return events;

		const augmentedEvents: IEvent[] = [];
		for (const event of events) {
			if (this.#sagaStarters.has(event.type)) {
				if (event.sagaId)
					throw new Error(`Event "${event.type}" already contains sagaId. Multiple sagas with same event type are not supported`);

				(event as IEvent).sagaId = await this.getNewId();
				(event as IEvent).sagaVersion = 0;

				augmentedEvents.push(event);
			}
			else {
				augmentedEvents.push(event);
			}
		}
		return augmentedEvents;
	}

	on(messageType: string, handler: IMessageHandler) {
		this.eventBus.on(messageType, handler);
	}

	off(messageType: string, handler: IMessageHandler) {
		this.eventBus.off(messageType, handler);
	}

	queue(name: string): IObservable {
		if (!this.eventBus.queue)
			throw new Error('Injected eventBus does not support named queues');

		return this.eventBus.queue(name);
	}

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.eventBus, subscribeTo, filter, handler, this.#logger);
	}
}
