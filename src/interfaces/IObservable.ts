import type { IMessage } from './IMessage.ts';
import { isObject } from './isObject.ts';

export interface IMessageHandler {
	(message: IMessage, meta?: Record<string, any>): unknown | Promise<unknown>
}

export interface IObservable {

	/**
	 * Setup a listener for a specific event type
	 */
	on(type: string, handler: IMessageHandler): void;

	/**
	 * Remove previously installed listener
	 */
	off(type: string, handler: IMessageHandler): void;
}

export const isIObservable = (obj: unknown): obj is IObservable =>
	isObject(obj)
	&& 'on' in obj
	&& typeof obj.on === 'function'
	&& 'off' in obj
	&& typeof obj.off === 'function';
