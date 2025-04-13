import { Identifier } from './Identifier';
import { isObject } from './isObject';

export interface IMessage<TPayload = any> {

	/** Event or command type */
	type: string;

	aggregateId?: Identifier;
	aggregateVersion?: number;

	sagaId?: Identifier;
	sagaVersion?: number;

	payload?: TPayload;
	context?: any;
}

export const isMessage = (obj: unknown): obj is IMessage =>
	isObject(obj)
	&& 'type' in obj
	&& typeof obj.type === 'string';
