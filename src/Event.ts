import { IEvent } from './interfaces';

/**
 * Get text description of an event for logging purposes
 */
export function describe(event: IEvent): string {
	return `'${event.type}' of ${event.aggregateId} (v${event.aggregateVersion})`;
}

/**
 * Get text description of a set of events for logging purposes
 */
export function describeMultiple(events: ReadonlyArray<IEvent>): string {
	if (events.length === 1)
		return describe(events[0]);

	return `${events.length} events`;
}
