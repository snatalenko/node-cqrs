declare interface IEventStore extends IObservable {
	getNewId(): Promise<Identifier>;

	commit(events: IEventStream): Promise<IEventStream>;

	getAllEvents(eventTypes: string[]): AsyncIterableIterator<IEvent>;

	getAggregateEvents(aggregateId: Identifier): Promise<IEventStream>;

	getSagaEvents(sagaId: Identifier, filter: { beforeEvent: IEvent }): Promise<IEventStream>;

	registerSagaStarters(eventTypes: string[]): void;

	once(messageType: string, handler?: IMessageHandler, filter?: function(IEvent): boolean):
		Promise<IEvent>;

	snapshotsSupported?: boolean;
}
