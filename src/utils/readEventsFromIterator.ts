import {
	IEvent,
	IEventSet,
	IEventStream
} from "../interfaces";

export async function readEventsFromIterator(iterator: IEventStream): Promise<IEventSet> {
	const events: IEvent[] = [];
	for await (const event of iterator)
		events.push(event);
	return events;
}
