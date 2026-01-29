import type { IMessage } from './IMessage.ts';
import { isObject } from './isObject.ts';

export type IEvent<TPayload = any> = IMessage<TPayload> & {

	/** Unique event identifier */
	id?: string;
};

export const isEvent = (event: unknown): event is IEvent =>
	isObject(event)
	&& 'type' in event
	&& typeof event.type === 'string'
	&& event.type.length > 0;
