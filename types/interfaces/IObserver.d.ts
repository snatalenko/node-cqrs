declare type IMessageHandler = (message: IMessage) => void;

declare interface IObservable {
	on(type: string, handler: IMessageHandler): void;

	queue?(name: string): IObservable;
}

declare interface IObserver {
	subscribe(observable: IObservable): void;
}
