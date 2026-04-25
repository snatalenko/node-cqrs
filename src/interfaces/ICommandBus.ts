import type { ICommand } from './ICommand.ts';
import type { IMessageMeta } from './IMessageMeta.ts';
import type { IObservable } from './IObservable.ts';
import type { IObserver } from './IObserver.ts';

export type CommandOptions = IMessageMeta & {
	payload?: object,
	context?: object,
	[key: string]: any
};

export interface ICommandBus extends IObservable {
	send(command: ICommand, meta?: IMessageMeta): Promise<any>;
	send(commandType: string, aggregateId?: string, options?: CommandOptions): Promise<any>;

	/** @deprecated Use {@link send} */
	sendRaw(command: ICommand): Promise<any>;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
