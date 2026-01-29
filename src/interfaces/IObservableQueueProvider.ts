import type { IObservable } from './IObservable.ts';
import { isObject } from './isObject.ts';

export interface IObservableQueueProvider {

	/**
	 * Get or create a named queue, which delivers events to a single handler only
	 */
	queue(name: string): IObservable;
}

export const isIObservableQueueProvider = (obj: unknown): obj is IObservableQueueProvider =>
	isObject(obj)
	&& 'queue' in obj
	&& typeof obj.queue === 'function';
