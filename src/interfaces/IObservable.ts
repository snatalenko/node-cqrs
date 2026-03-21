import type { IMessage } from './IMessage.ts';
import type { IMessageMeta } from './IMessageMeta.ts';
import { isObject } from './isObject.ts';

export interface IMessageHandler {
	(message: IMessage, meta?: IMessageMeta): unknown | Promise<unknown>
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

export const isObservable = (obj: unknown): obj is IObservable =>
	isObject(obj)
	&& 'on' in obj
	&& typeof obj.on === 'function'
	&& 'off' in obj
	&& typeof obj.off === 'function';
