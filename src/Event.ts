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

/**
 * Validate event structure
 */
export function validate(event: IEvent) {
	if (typeof event !== 'object' || !event)
		throw new TypeError('event must be an Object');
	if (typeof event.type !== 'string' || !event.type.length)
		throw new TypeError('event.type must be a non-empty String');
	if (!event.aggregateId && !event.sagaId)
		throw new TypeError('either event.aggregateId or event.sagaId is required');
	if (event.sagaId && typeof event.sagaVersion === 'undefined')
		throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
}
