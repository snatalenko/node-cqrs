namespace NodeCqrs {

	/**
	 * Facade that combines functionality of IEventStorage and IObservable into single IEventStore interface.
	 * 
	 * If storage instance implements the IObservable interface, it can be used directly without this facade.
	 */
	declare class EventStore implements IEventStorage, IObservable {

		/** Creates an instance of EventStore. */
		constructor(options: { storage: IEventStorage, messageBus: IMessageBus, eventValidator?: IMessageHandler, eventStoreConfig?: { publishAsync?: boolean }, logger?: ILogger }): void;

		/** Retrieve new ID from the storage */
		getNewId(): Promise<Identifier>;

		/** Save and publish a set of events */
		commit(streamId: Identifier, events: IEventStream): Promise<IEventStream>;

		/** Get a stream of events by identifier */
		getStream(streamId: Identifier, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent>;

		/** Get events by their types */
		getEventsByTypes(eventTypes: Array<string>, filter: IEventQueryFilter): AsyncIterableIterator<IEvent>;

		/** Setup listener for specific event type */
		on(messageType: string, handler: IMessageHandler): void;

		/** Remove previously installed listener */
		off(messageType: string, handler: IMessageHandler): void;

		/** Get or create a named queue, which delivers events to a single handler only */
		queue(name: string): IObservable;

		/** Creates one-time subscription for one or multiple events that match a filter */
		once(messageTypes: string | Array<string>, handler?: IMessageHandler, filter?: function): Promise<IEvent>;
	}
}
