import type { Identifier } from './Identifier.ts';
import { isObject } from './isObject.ts';

export type SagaOriginsMap = Record<string, string>;

export interface IMessage<TPayload = any> {

	/** Event or command type */
	type: string;

	/**
 	 * Target aggregate identifier for commands,
	 * originating aggregate identifier for events
	 */
	aggregateId?: Identifier;

	/** Aggregate version at the time of the message */
	aggregateVersion?: number;

	/** Starter event ids of sagas associated with this message, keyed by saga descriptor */
	sagaOrigins?: SagaOriginsMap;

	/** Business data */
	payload: TPayload;

	/**
	 * Optional metadata/context (e.g. auth info, request id);
	 * Commonly set on commands, then copied to emitted events
	 */
	context?: any;
}

export const isMessage = (obj: unknown): obj is IMessage =>
	isObject(obj)
	&& 'type' in obj
	&& typeof obj.type === 'string';
