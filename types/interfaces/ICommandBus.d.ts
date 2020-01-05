interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: Identifier, options: { payload?: object, context?: object }):
		Promise<IEventStream>;
	sendRaw(ICommand):
		Promise<IEventStream>;
}
