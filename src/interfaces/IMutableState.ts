import type { IEvent } from './IEvent';

export interface IMutableState {

	/**
	 * Optional list of event types that are required to restore this state.
	 *
	 * Exposed by AbstractAggregate as `restoresFrom` and may be used by the command handler
	 * to load only the state-relevant events when rehydrating an aggregate.
	 */
	handles?: Readonly<string[]>;

	/**
	 * Apply a single event to mutate the state.
	 */
	mutate(event: IEvent): void;
}
