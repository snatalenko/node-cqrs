import { Identifier } from "./Identifier";
import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";
import { IEventStream } from "./IEventStream";
import { isObject } from "./isObject";

export type EventQueryAfter = {
	/** Get events emitted after this specific event */
	afterEvent?: IEvent;
}

export type EventQueryBefore = {
	/** Get events emitted before this specific event */
	beforeEvent?: IEvent;
}

export interface IEventStoreReader {
	/**
	 * Retrieves events of specified types that were emitted after a given event.
	 */
	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream;

	/**
	 * Retrieves all events (and optionally a snapshot) associated with a specific aggregate.
	 */
	getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): IEventStream;

	/**
	 * Retrieves events associated with a saga, with optional filtering by version or timestamp.
	 */
	getSagaEvents(sagaId: Identifier, options: EventQueryBefore): IEventStream;
}

export const isIEventStoreReader = (storage: unknown): storage is IEventStoreReader =>
	isObject(storage)
	&& 'getEventsByTypes' in storage
	&& typeof storage.getEventsByTypes === 'function'
	&& 'getAggregateEvents' in storage
	&& typeof storage.getAggregateEvents === 'function'
	&& 'getSagaEvents' in storage
	&& typeof storage.getSagaEvents === 'function';

export interface IEventStoreWriter {
	/**
	 * Persists a set of events to the event store.
	 * Returns the persisted event set (potentially enriched or normalized).
	 */
	commitEvents(events: IEventSet): Promise<IEventSet>;
}
