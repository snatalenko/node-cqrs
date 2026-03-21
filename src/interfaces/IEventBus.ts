import type { IEvent } from './IEvent.ts';
import { type IObservable, isObservable } from './IObservable.ts';

export interface IEventBus extends IObservable {
	publish(event: IEvent, meta?: Record<string, any>): Promise<any>;
}

export const isEventBus = (obj: unknown) =>
	isObservable(obj)
	&& 'publish' in obj
	&& typeof obj.publish === 'function';
