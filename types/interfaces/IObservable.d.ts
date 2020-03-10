declare type IMessageHandler = (message: IMessage) => void;

declare interface IObservable {
	on(type: string, handler: IMessageHandler): void;

	off(type: string, handler: IMessageHandler): void;

	queue?(name: string): IObservable;
}
