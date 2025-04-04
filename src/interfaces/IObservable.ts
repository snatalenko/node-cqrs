import { IMessage } from "./IMessage";
import { isObject } from "./isObject";

export interface IMessageHandler {
	(message: IMessage, meta?: Record<string, any>): any | Promise<any>
};

export interface IObservable {
	/**
	 * Setup a listener for a specific event type
	 */
	on(type: string, handler: IMessageHandler): void;

	/**
	 * Remove previously installed listener
	 */
	off(type: string, handler: IMessageHandler): void;

	/**
	 * Get or create a named queue, which delivers events to a single handler only
	 */
	queue?(name: string): IObservable;
}

export const isIObservable = (obj: unknown): obj is IObservable =>
	isObject(obj)
	&& 'on' in obj
	&& typeof obj.on === 'function'
	&& 'off' in obj
	&& typeof obj.off === 'function';
