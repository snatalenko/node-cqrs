namespace NodeCqrs {

	/**
	 * A simple event storage implementation intended to use for tests only.
	 * Storage content resets on each app restart.
	 */
	declare class InMemoryEventStorage implements IEventStorage {

		/** Creates instance of InMemoryEventStorage */
		constructor(options?: { logger?: ILogger }): void;

		/** Generate unique identifier */
		getNewId(): number;

		/** Save events to a stream with given ID */
		commit(streamId: Identifier, events: IEventStream): Promise<IEventStream>;

		/** Get event stream with a given ID */
		getStream(streamId: Identifier, filter?: { afterEvent?: IEvent, beforeEvent?: IEvent }): AsyncIterableIterator<IEvent>;

		/** Get events by given event types */
		getEventsByTypes(eventTypes: Array<string>, filter?: { afterEvent?: IEvent, beforeEvent?: IEvent }): AsyncIterableIterator<IEvent>;
	}
}
