import type { ICommand } from './ICommand.ts';
import type { IEventSet } from './IEventSet.ts';
import type { IObservable } from './IObservable.ts';
import type { IObserver } from './IObserver.ts';

export interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId?: string, options?: { payload?: object, context?: object }):
		Promise<IEventSet>;

	sendRaw(command: ICommand):
		Promise<IEventSet>;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
