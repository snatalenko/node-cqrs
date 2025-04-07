import { ICommand } from './ICommand';
import { IEvent } from './IEvent';
import { IObservable } from './IObservable';

export interface IMessageBus extends IObservable {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent): Promise<any>;
}
