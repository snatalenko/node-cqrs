import type { ICommand } from './ICommand.ts';
import type { IObservable } from './IObservable.ts';
import type { IObserver } from './IObserver.ts';

export interface ICommandBus extends IObservable {
	send(command: ICommand): Promise<any>;
	send(commandType: string, aggregateId?: string, options?: { payload?: object, context?: object }): Promise<any>;

	/** @deprecated Use {@link send} */
	sendRaw(command: ICommand): Promise<any>;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
