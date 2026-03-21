import { type IEvent, isEvent } from './IEvent.ts';

export type IEventSet = ReadonlyArray<Readonly<IEvent>>;

export const isEventSet = (arr: unknown): arr is IEventSet =>
	Array.isArray(arr)
	&& arr.every(isEvent);
