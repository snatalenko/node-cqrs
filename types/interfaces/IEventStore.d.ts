declare interface IEventStore extends IEventStorage, IObservable {
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: function(IEvent): boolean): Promise<IEvent>;
}
