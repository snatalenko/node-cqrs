import type { Identifier } from './Identifier.ts';
import type { IEvent } from './IEvent.ts';
import type { IEventStream } from './IEventStream.ts';
import type { ISnapshotEvent } from './ISnapshotEvent.ts';
import { isObject } from './isObject.ts';

export type EventQueryAfter = {

	/** Get events emitted after this specific event */
	afterEvent?: IEvent;
}

export type EventQueryBefore = {

	/** Get events emitted before this specific event */
	beforeEvent?: IEvent;
}

export type AggregateEventsQueryParams = {

	/**
	 * Optional snapshot event. If provided, storage should return only events after
	 * the snapshot's aggregateVersion.
	 */
	snapshot?: ISnapshotEvent,

	/**
	 * Optional list of event types to return.
	 *
	 * IMPORTANT: If you filter eventTypes, make sure you still restore the aggregate
	 * version correctly (e.g. via `tail: 'last'`), otherwise emitted events may get
	 * incorrect aggregateVersion values.
	 */
	eventTypes?: Readonly<string[]>,

	/**
	 * Optionally include the last aggregate event (after snapshot), regardless of type.
	 * Useful together with `eventTypes` to restore the aggregate version without pulling
	 * the full stream.
	 */
	tail?: 'last'
}

export interface IEventStorageReader {

	/**
	 * Retrieves events of specified types that were emitted after a given event.
	 */
	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream;

	/**
	 * Retrieves all events (and optionally a snapshot) associated with a specific aggregate.
	 */
	getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream;

	/**
	 * Retrieves events associated with a saga, with optional filtering by version or timestamp.
	 */
	getSagaEvents(sagaId: Identifier, options: EventQueryBefore): IEventStream;
}


export const isIEventStorageReader = (storage: unknown): storage is IEventStorageReader =>
	isObject(storage)
	&& 'getEventsByTypes' in storage
	&& typeof storage.getEventsByTypes === 'function'
	&& 'getAggregateEvents' in storage
	&& typeof storage.getAggregateEvents === 'function'
	&& 'getSagaEvents' in storage
	&& typeof storage.getSagaEvents === 'function';
