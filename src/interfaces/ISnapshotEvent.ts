import { type IEvent, isEvent } from './IEvent.ts';

export const SNAPSHOT_EVENT_TYPE: 'snapshot' = 'snapshot';

export interface ISnapshotEvent extends IEvent {
	type: typeof SNAPSHOT_EVENT_TYPE
}

export const isSnapshotEvent = (event?: unknown): event is ISnapshotEvent =>
	isEvent(event) && event.type === SNAPSHOT_EVENT_TYPE;
