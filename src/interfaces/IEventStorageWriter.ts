import type { IEventSet } from './IEventSet.ts';
import { isObject } from './isObject.ts';

export type CommitEventsOptions = {
	ignoreConcurrencyError?: boolean;
};

export interface IEventStorageWriter {

	/**
	 * Persists a set of events to the event store.
	 * Returns the persisted event set (potentially enriched or normalized).
	 */
	commitEvents(events: IEventSet, options?: CommitEventsOptions): Promise<IEventSet>;
}

export const isEventStorageWriter = (obj: unknown): obj is IEventStorageWriter =>
	isObject(obj)
	&& 'commitEvents' in obj
	&& typeof obj.commitEvents === 'function';
