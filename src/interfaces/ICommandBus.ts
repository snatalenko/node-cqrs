import { ICommand } from "./ICommand";
import { IEventSet } from "./IEventSet";
import { IObservable } from "./IObservable";
import { IObserver } from "./IObserver";

export interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: string | undefined, options: { payload?: object, context?: object }):
		Promise<IEventSet>;

	sendRaw(command: ICommand):
		Promise<IEventSet>;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
