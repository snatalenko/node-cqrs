export interface IMessageHandler {
	(...args: any[]): any | Promise<any>
};

export interface IObservable {
	on(type: string, handler: IMessageHandler): void;

	off(type: string, handler: IMessageHandler): void;

	queue?(name: string): IObservable;
}
