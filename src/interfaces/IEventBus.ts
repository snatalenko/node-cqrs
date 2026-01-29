import type { IEvent } from './IEvent.ts';
import { type IObservable, isIObservable } from './IObservable.ts';

export interface IEventBus extends IObservable {
	publish(event: IEvent, meta?: Record<string, any>): Promise<any>;
}

export const isIEventBus = (obj: unknown) =>
	isIObservable(obj)
	&& 'publish' in obj
	&& typeof obj.publish === 'function';
