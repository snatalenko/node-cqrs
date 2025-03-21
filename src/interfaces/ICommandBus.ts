import { ICommand } from "./ICommand";
import { IEventSet } from "./IEventSet";
import { IMessageHandler, IObservable } from "./IObservable";
import { IObserver } from "./IObserver";

export interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: string, options: { payload?: object, context?: object }):
		Promise<IEventSet>;

	sendRaw(command: ICommand):
		Promise<IEventSet>;

	on(type: string, handler: IMessageHandler): void;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
