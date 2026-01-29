import type { ICommand } from './ICommand';
import type { IEvent } from './IEvent';
import type { IObservable } from './IObservable';

export interface IMessageBus extends IObservable {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent, meta?: Record<string, any>): Promise<any>;
}
