import type { IEventSet } from './IEventSet.ts';

export interface IEventStorageWriter {

	/**
	 * Persists a set of events to the event store.
	 * Returns the persisted event set (potentially enriched or normalized).
	 */
	commitEvents(events: IEventSet): Promise<IEventSet>;
}
