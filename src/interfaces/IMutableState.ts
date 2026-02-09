import type { IEvent } from './IEvent';
// import { isObject } from './isObject';

export interface IMutableState {

	/**
	 * Apply a single event to mutate the state
	 */
	mutate(event: IEvent): void;
}

// export const isMutableState = (obj: unknown): obj is IMutableState =>
// 	isObject(obj)
// 	&& 'mutate' in obj
// 	&& typeof obj.mutate === 'function';
