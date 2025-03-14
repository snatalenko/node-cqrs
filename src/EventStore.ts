import {
	IAggregateSnapshotStorage,
	IEvent,
	IEventStorage,
	IEventSet,
	IExtendableLogger,
	ILogger,
	IMessageBus,
	IMessageHandler,
	IObservable,
	IEventStream,
	IEventStore,
	EventQueryAfter,
	EventQueryBefore,
	Identifier
} from "./interfaces";
import {
	getClassName,
	setupOneTimeEmitterSubscription,
	CompoundEmitter,
	isIEventStorage,
	isIMessageBus
} from "./utils";
import * as Event from './Event';

const SNAPSHOT_EVENT_TYPE = 'snapshot';

export class EventStore implements IEventStore {

	#validator: (event: IEvent<any>) => void;
	#logger?: ILogger;
	#storage: IEventStorage;
	#supplementaryEventBus?: IMessageBus;
	#snapshotStorage: IAggregateSnapshotStorage | undefined;
	#sagaStarters: string[] = [];
	#compoundEmitter: CompoundEmitter;

	/** Whether storage supports aggregate snapshots */
	get snapshotsSupported(): boolean {
		return Boolean(this.#snapshotStorage);
	}

	constructor({
		storage,
		supplementaryEventBus,
		snapshotStorage,
		eventValidator = Event.validate,
		logger
	}: {
		storage: IEventStorage,

		/** Optional event dispatcher for publishing persisted events externally */
		supplementaryEventBus?: IMessageBus,
		snapshotStorage?: IAggregateSnapshotStorage,
		eventValidator?: IMessageHandler,
		logger?: ILogger | IExtendableLogger
	}) {
		if (!storage)
			throw new TypeError('storage argument required');
		if (!isIEventStorage(storage))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (supplementaryEventBus && !isIMessageBus(supplementaryEventBus))
			throw new TypeError('supplementaryEventBus does not implement IMessageBus interface');

		this.#validator = eventValidator;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
		this.#storage = storage;
		this.#snapshotStorage = snapshotStorage;
		this.#supplementaryEventBus = supplementaryEventBus;
		this.#compoundEmitter = new CompoundEmitter(supplementaryEventBus, storage);
	}


	/** Retrieve new ID from the storage */
	async getNewId(): Promise<Identifier> {
		return this.#storage.getNewId();
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
		const uniqueEventTypes = eventTypes.filter(e => !this.#sagaStarters.includes(e));
		this.#sagaStarters.push(...uniqueEventTypes);
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param events - a set of events to commit
	 * @returns Signed and committed events
	 */
	async commit(events: IEventSet): Promise<IEventSet> {
		if (!Array.isArray(events))
			throw new TypeError('events argument must be an Array');

		const containsSagaStarters = this.#sagaStarters.length && events.some(e => this.#sagaStarters.includes(e.type));
		const augmentedEvents = containsSagaStarters ?
			await this.#attachSagaIdToSagaStarterEvents(events) :
			events;

		const eventStreamWithoutSnapshots = await this.persistEventsAndSnapshots(augmentedEvents);

		// after events are saved to the persistent storage,
		// publish them to the event bus (i.e. RabbitMq)
		if (this.#supplementaryEventBus)
			await this.publishEvents(eventStreamWithoutSnapshots);

		return eventStreamWithoutSnapshots;
	}

	/** Generate and attach sagaId to events that start new sagas */
	async #attachSagaIdToSagaStarterEvents(events: IEventSet): Promise<IEventSet> {
		const augmentedEvents: IEvent[] = [];
		for (const event of events) {
			if (this.#sagaStarters.includes(event.type)) {
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

	/**
	 * Save events and snapshots to the persistent storages
	 * 
	 * @returns Event set without "snapshot" events
	 */
	protected async persistEventsAndSnapshots(events: IEventSet): Promise<IEventSet> {
		if (!Array.isArray(events))
			throw new TypeError('events argument must be an Array');

		const snapshotEvents = events.filter(e => e.type === SNAPSHOT_EVENT_TYPE);
		if (snapshotEvents.length > 1)
			throw new Error(`cannot commit a stream with more than 1 ${SNAPSHOT_EVENT_TYPE} event`);
		if (snapshotEvents.length && !this.snapshotsSupported)
			throw new Error(`${SNAPSHOT_EVENT_TYPE} event type is not supported by the storage`);

		const snapshot = snapshotEvents[0];
		const eventsWithoutSnapshot = events.filter(e => e !== snapshot);

		this.#logger?.debug(`validating ${Event.describeMultiple(eventsWithoutSnapshot)}...`);
		eventsWithoutSnapshot.forEach(this.#validator);

		this.#logger?.debug(`saving ${Event.describeMultiple(eventsWithoutSnapshot)}...`);
		await Promise.all([
			this.#storage.commitEvents(eventsWithoutSnapshot),
			snapshot ?
				this.#snapshotStorage?.saveAggregateSnapshot(snapshot) :
				undefined
		]);

		return eventsWithoutSnapshot;
	}

	protected async publishEvents(events: IEventSet) {
		if (!this.#supplementaryEventBus)
			throw new Error('No supplementaryEventBus injected, events cannot be published');

		this.#logger?.debug(`publishing ${Event.describeMultiple(events)}...`);

		try {
			for (const event of events)
				this.#supplementaryEventBus.publish(event);

			this.#logger?.debug(`${Event.describeMultiple(events)} published`);
		}
		catch (error: any) {
			this.#logger?.error(`${Event.describeMultiple(events)} publishing failed: ${error.message}`, {
				stack: error.stack
			});
			throw error;
		}
	}

	on(messageType: string, handler: IMessageHandler) {
		this.#compoundEmitter.on(messageType, handler);
	}

	off(messageType: string, handler: IMessageHandler) {
		this.#compoundEmitter.off(messageType, handler);
	}

	queue(name: string): IObservable {
		return this.#compoundEmitter.queue(name);
	}

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.#compoundEmitter, subscribeTo, filter, handler, this.#logger);
	}
}
