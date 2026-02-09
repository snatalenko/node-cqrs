import type { IEvent } from './IEvent';

export interface IMutableState {

	/**
	 * Apply a single event to mutate the state
	 */
	mutate(event: IEvent): void;
}
