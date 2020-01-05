declare interface IMessageBus extends IObservable {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent): Promise<any>;
}

