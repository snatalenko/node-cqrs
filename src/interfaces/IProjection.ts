import type { IObserver } from './IObserver.ts';
import type { IObservable } from './IObservable.ts';
import type { IEventStorageReader } from './IEventStorageReader.ts';
import type { IEvent } from './IEvent.ts';
import type { IEventTracker } from './IEventTracker.ts';

export interface IProjection<TView> extends IObserver {
	readonly view: TView;

	/**
	 * Event tracker allowing to await until specific events are projected.
	 * `null` when the projection supports event trackers but has none, `undefined` when it does not support them.
	 */
	readonly eventTracker?: IEventTracker | null;

	/** Subscribe to new events */
	subscribe(eventStore: IObservable): void;

	/** Restore view state from not-yet-projected events */
	restore(eventStore: IEventStorageReader): Promise<void> | void;

	/** Project new event */
	project(event: IEvent, meta?: Record<string, any>): Promise<void> | void;
}

export interface IProjectionConstructor {
	new(c?: any): IProjection<any>;
	readonly handles?: string[];
}
