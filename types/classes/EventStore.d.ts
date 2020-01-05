declare class EventStore implements IEventStore {

	/** Default configuration */
	static defaults: EventStoreConfig;

	/** Configuration */
	readonly config: EventStoreConfig;

	/** Whether storage supports aggregate snapshots */
	readonly snapshotsSupported: boolean;

	/** Creates an instance of EventStore. */
	constructor(options: { storage: IEventStorage, snapshotStorage?: IAggregateSnapshotStorage, messageBus?: IMessageBus, eventValidator?: function, eventStoreConfig?: EventStoreConfig, logger?: ILogger }): EventStore;

	/** Retrieve new ID from the storage */
	getNewId(): Promise<Identifier>;

	/** Retrieve all events of specific types */
	getAllEvents(eventTypes: Array<string>): AsyncIterableIterator<IEvent>;

	/** Retrieve all events of specific Aggregate */
	getAggregateEvents(aggregateId: string | number): Promise<IEventStream>;

	/** Retrieve events of specific Saga */
	getSagaEvents(sagaId: string | number, filter: EventFilter): Promise<IEventStream>;

	/**
	 * Register event types that start sagas.
	 * Upon such event commit a new sagaId will be assigned
	 */
	registerSagaStarters(eventTypes: Array<string>): void;

	/** Validate events, commit to storage and publish to messageBus, if needed */
	commit(events: IEventStream): Promise<IEventStream>;

	/** Save events to the persistent storage(s) */
	save(events: IEventStream): Promise<IEventStream>;

	/** After events are */
	publish(eventStream: IEventStream): void;

	/** Setup a listener for a specific event type */
	on(messageType: string, handler: function): void;

	/** Get or create a named queue, which delivers events to a single handler only */
	queue(name: string): void;

	/** Creates one-time subscription for one or multiple events that match a filter */
	once(messageTypes: string | Array<string>, handler?: function, filter?: function): Promise<IEvent>;
}
