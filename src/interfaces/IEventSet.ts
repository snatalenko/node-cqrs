import { IEvent, isEvent } from "./IEvent";

export type IEventSet = ReadonlyArray<Readonly<IEvent>>;

export const isEventSet = (arr: unknown): arr is IEventSet =>
	Array.isArray(arr)
	&& arr.every(isEvent);
