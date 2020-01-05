declare interface IEventReceptor extends IObserver {
	subscribe(eventStore: IEventStore): void;
}
