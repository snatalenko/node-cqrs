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
	EventQueryBefore
} from "./interfaces";
import { getClassName, setupOneTimeEmitterSubscription } from "./utils";
import * as Event from './Event';

const isIEventStorage = (storage: IEventStorage): storage is IEventStorage =>
	storage
	&& typeof storage.getNewId === 'function'
	&& typeof storage.commitEvents === 'function'
	&& typeof storage.getEvents === 'function'
	&& typeof storage.getAggregateEvents === 'function'
	&& typeof storage.getSagaEvents === 'function';

const isIObservable = (obj: IObservable | any): obj is IObservable =>
	obj
	&& 'on' in obj
	&& typeof obj.on === 'function'
	&& 'off' in obj
	&& typeof obj.off === 'function';

const isIMessageBus = (bus: IMessageBus | any): bus is IMessageBus =>
	bus
	&& isIObservable(bus)
	&& 'send' in bus
	&& typeof bus.send === 'function'
	&& 'publish' in bus
	&& typeof bus.publish === 'function';

const SNAPSHOT_EVENT_TYPE = 'snapshot';

export class EventStore implements IEventStore {

	#publishAsync: boolean;
	#validator: (event: IEvent<any>) => void;
	#logger?: ILogger;
	#storage: IEventStorage;
	#messageBus?: IMessageBus;
	#snapshotStorage: IAggregateSnapshotStorage | undefined;
	#sagaStarters: string[] = [];
	#defaultEventEmitter: IObservable;

	/** Whether storage supports aggregate snapshots */
	get snapshotsSupported(): boolean {
		return Boolean(this.#snapshotStorage);
	}

	constructor({
		storage,
		messageBus,
		snapshotStorage,
		eventValidator = Event.validate,
		eventStoreConfig,
		logger
	}: {
		storage: IEventStorage,
		messageBus?: IMessageBus,
		snapshotStorage?: IAggregateSnapshotStorage,
		eventValidator?: IMessageHandler,
		eventStoreConfig?: {
			publishAsync?: boolean
		},
		logger?: ILogger | IExtendableLogger
	}) {
		if (!storage)
			throw new TypeError('storage argument required');
		if (!isIEventStorage(storage))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (messageBus && !isIMessageBus(messageBus))
			throw new TypeError('messageBus does not implement IMessageBus interface');
		if (messageBus && isIObservable(storage))
			throw new TypeError('both storage and messageBus implement IObservable interface, it is not yet supported');

		const defaultEventEmitter = isIObservable(storage) ? storage : messageBus;
		if (!defaultEventEmitter)
			throw new TypeError('storage must implement IObservable if messageBus is not injected');

		this.#publishAsync = eventStoreConfig?.publishAsync ?? true;
		this.#validator = eventValidator;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
		this.#storage = storage;
		this.#snapshotStorage = snapshotStorage;
		this.#messageBus = messageBus;
		this.#defaultEventEmitter = defaultEventEmitter;
	}


	/** Retrieve new ID from the storage */
	async getNewId(): Promise<string> {
		return this.#storage.getNewId();
	}

	/** Retrieve all events of specific types */
	async* getAllEvents(eventTypes?: string[]): IEventStream {
		if (eventTypes && !Array.isArray(eventTypes))
			throw new TypeError('eventTypes, if specified, must be an Array');

		this.#logger?.debug(`retrieving ${eventTypes ? eventTypes.join(', ') : 'all'} events...`);

		const eventsIterable = await this.#storage.getEvents(eventTypes);

		yield* eventsIterable;

		this.#logger?.debug(`${eventTypes ? eventTypes.join(', ') : 'all'} events retrieved`);
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options: EventQueryAfter): IEventStream {
		const eventsIterable = await this.#storage.getEventsByTypes(eventTypes, options);

		yield* eventsIterable;
	}

	/** Retrieve all events of specific Aggregate */
	async getAggregateEvents(aggregateId: string): Promise<IEventSet> {
		if (!aggregateId)
			throw new TypeError('aggregateId argument required');

		this.#logger?.debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const snapshot = this.#snapshotStorage ?
			await this.#snapshotStorage.getAggregateSnapshot(aggregateId) :
			undefined;

		const events: IEvent[] = [];
		if (snapshot)
			events.push(snapshot);

		const eventsIterable = await this.#storage.getAggregateEvents(aggregateId, { snapshot });
		for await (const event of eventsIterable)
			events.push(event);

		this.#logger?.debug(`${Event.describeMultiple(events)} retrieved`);

		return events;
	}

	/** Retrieve events of specific Saga */
	async getSagaEvents(sagaId: string, filter: EventQueryBefore) {
		if (!sagaId)
			throw new TypeError('sagaId argument required');
		if (!filter)
			throw new TypeError('filter argument required');
		if (!filter.beforeEvent)
			throw new TypeError('filter.beforeEvent argument required');
		if (filter.beforeEvent.sagaVersion === undefined)
			throw new TypeError('filter.beforeEvent.sagaVersion argument required');

		this.#logger?.debug(`retrieving event stream for saga ${sagaId}, v${filter.beforeEvent.sagaVersion}...`);

		const events: IEvent[] = [];
		const eventsIterable = await this.#storage.getSagaEvents(sagaId, filter);
		for await (const event of eventsIterable)
			events.push(event);

		this.#logger?.debug(`${Event.describeMultiple(events)} retrieved`);

		return events;
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
	 * @param {IEventSet} events - a set of events to commit
	 * @returns {Promise<IEventSet>} - resolves to signed and committed events
	 */
	async commit(events) {
		if (!Array.isArray(events))
			throw new TypeError('events argument must be an Array');

		const containsSagaStarters = this.#sagaStarters.length && events.some(e => this.#sagaStarters.includes(e.type));
		const augmentedEvents = containsSagaStarters ?
			await this.#attachSagaIdToSagaStarterEvents(events) :
			events;

		const eventStreamWithoutSnapshots = await this.save(augmentedEvents);

		// after events are saved to the persistent storage,
		// publish them to the event bus (i.e. RabbitMq)
		if (this.#messageBus)
			await this.#publish(eventStreamWithoutSnapshots);

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

	/** Save events to the persistent storage(s) */
	async save(events: IEventSet): Promise<IEventSet> {
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

	async #publish(events: IEventSet) {
		if (this.#publishAsync) {
			this.#logger?.debug(`publishing ${Event.describeMultiple(events)} asynchronously...`);
			setImmediate(() => this.#publishEvents(events));
		}
		else {
			this.#logger?.debug(`publishing ${Event.describeMultiple(events)} synchronously...`);
			await this.#publishEvents(events);
		}
	}

	async #publishEvents(events: IEventSet) {
		if (!this.#messageBus)
			return;

		try {
			await Promise.all(events.map(event =>
				this.#messageBus?.publish(event)));

			this.#logger?.debug(`${Event.describeMultiple(events)} published`);
		}
		catch (error: any) {
			this.#logger?.error(`${Event.describeMultiple(events)} publishing failed: ${error.message}`, {
				stack: error.stack
			});
			throw error;
		}
	}

	/** Setup a listener for a specific event type */
	on(messageType: string, handler: IMessageHandler) {
		if (typeof messageType !== 'string' || !messageType.length)
			throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');
		if (arguments.length !== 2)
			throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);

		if (isIObservable(this.#storage))
			this.#storage.on(messageType, handler);

		this.#messageBus?.on(messageType, handler);
	}

	/** Remove previously installed listener */
	off(messageType: string, handler: IMessageHandler) {
		if (isIObservable(this.#storage))
			this.#storage.off(messageType, handler);

		this.#messageBus?.off(messageType, handler);
	}

	/** Get or create a named queue, which delivers events to a single handler only */
	queue(name: string): IObservable {
		if (!this.#defaultEventEmitter.queue)
			throw new Error('Named queues are not supported by the underlying message bus');

		return this.#defaultEventEmitter.queue(name);
	}

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | string[], handler: IMessageHandler, filter: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.#defaultEventEmitter, subscribeTo, filter, handler, this.#logger);
	}
}
