import type { Identifier } from './Identifier.ts';
import { isObject } from './isObject.ts';

export interface IMessage<TPayload = unknown> {

	/** Event or command type */
	type: string;

	/** Target aggregate identifier for commands, originating aggregate identifier for events */
	aggregateId?: Identifier;

	/** Aggregate version at the time of the message */
	aggregateVersion?: number;

	/** Starter event ids of sagas associated with this message, keyed by saga descriptor */
	sagaOrigins?: Record<string, string>;

	/** Business data */
	payload: TPayload;

	/** Optional metadata/context (e.g. auth info, request id); set on commands, copied to events */
	context?: any;
}

export const isMessage = (obj: unknown): obj is IMessage =>
	isObject(obj)
	&& 'type' in obj
	&& typeof obj.type === 'string'
	&& obj.type.length > 0;
