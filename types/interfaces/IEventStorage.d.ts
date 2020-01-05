declare interface IEventEmitter extends IObservable {
	on?(messageType: string, handler: IMessageHandler): void;
	off?(messageType: string, handler: IMessageHandler): void;
}

declare type EventFilter = { afterEvent?: IEvent; beforeEvent?: IEvent; };

declare interface IEventStorage extends IEventEmitter {
	getNewId(): Identifier | Promise<Identifier>;

	commitEvents(events: ReadonlyArray<IEvent>):
		Promise<any>;

	getAggregateEvents(aggregateId: Identifier, options: { snapshot: IEvent }):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;

	getSagaEvents(sagaId: Identifier, filter: EventFilter):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;

	getEvents(eventTypes: string[]):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;
}
