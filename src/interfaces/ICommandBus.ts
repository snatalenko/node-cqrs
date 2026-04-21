import type { ICommand } from './ICommand.ts';
import type { IMessageMeta } from './IMessageMeta.ts';
import type { IObservable } from './IObservable.ts';
import type { IObserver } from './IObserver.ts';

export interface ICommandBus extends IObservable {
	send(command: ICommand, meta?: IMessageMeta): Promise<any>;
	send(commandType: string, aggregateId?: string, options?: { payload?: object, context?: object } & IMessageMeta):
		Promise<any>;

	/** @deprecated Use {@link send} */
	sendRaw(command: ICommand): Promise<any>;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
