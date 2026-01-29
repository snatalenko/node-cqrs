import type { ICommand } from './ICommand.ts';
import type { IEvent } from './IEvent.ts';
import type { IObservable } from './IObservable.ts';

export interface IMessageBus extends IObservable {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent, meta?: Record<string, any>): Promise<any>;
}
