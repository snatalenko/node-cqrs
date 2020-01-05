declare interface IEventStore extends IObservable {
	getNewId(): Promise<Identifier>;

	commit(events: IEventStream): Promise<IEventStream>;

	getAllEvents(eventTypes: string[], filter?: EventFilter): AsyncIterableIterator<IEvent>;
	getAggregateEvents(aggregateId: Identifier): Promise<IEventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<IEventStream>;

	registerSagaStarters(eventTypes: string[]): void;

	once(messageType: string, handler?: IMessageHandler, filter?: function(IEvent): boolean):
		Promise<IEvent>;

	snapshotsSupported?: boolean;
}

