'use strict';

import { IEvent } from "../interfaces";

export default async function readEventsFromIterator(iterator: AsyncIterableIterator<IEvent>): Promise<IEvent[]> {
	const events: IEvent[] = [];
	for await (const event of iterator)
		events.push(event);
	return events;
}
