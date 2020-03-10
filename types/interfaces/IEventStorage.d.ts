declare type IEventQueryFilter = {
	/** Get events emitted after this specific event */
	afterEvent?: IEvent;

	/** Get events emitted before this specific event */
	beforeEvent?: IEvent;
}

declare interface IEventStorage {
	/**
	 * Create unique identifier 
	 */
	getNewId(): Identifier | Promise<Identifier>;

	/**
	 * Save events to a stream with a given ID
	 * @param streamId
	 * @param events
	 * @returns {Promise<IEventStream>} Stream of events that were committed to the store for the first time
	 */
	commit(streamId: Identifier, events: IEventStream): Promise<IEventStream>;

	/**
	 * Get event stream by a given ID
	 * @param streamId
	 * @param filter
	 */
	getStream(streamId: Identifier, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent>;

	/**
	 * Get events by given event types
	 * @param eventTypes
	 * @param filter
	 */
	getEventsByTypes(eventTypes: Readonly<string[]>, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent>;
}
