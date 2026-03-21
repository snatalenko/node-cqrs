import type { IObserver } from './IObserver.ts';
import type { IObservable } from './IObservable.ts';
import type { IEventStorageReader } from './IEventStorageReader.ts';
import type { IEvent } from './IEvent.ts';

export interface IProjection<TView> extends IObserver {
	readonly view: TView;

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
