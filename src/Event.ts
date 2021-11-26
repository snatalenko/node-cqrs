import { IEvent } from "./interfaces";
import * as crypto from 'crypto';

const md5 = (data: object): string => crypto
	.createHash('md5')
	.update(JSON.stringify(data))
	.digest('hex')
	.replace(/==$/, '');

export default class Event {
	/**
	 * Get text description of an event for logging purposes
	 */
	static describe(event: IEvent): string {
		return `'${event.type}' of ${event.aggregateId} (v${event.aggregateVersion})`;
	}

	/**
	 * Get text description of a set of events for logging purposes
	 */
	 static describeMultiple(events: ReadonlyArray<IEvent>): string {
		if (events.length === 1)
			return Event.describe(events[0]);

		return `${events.length} events`;
	}

	/**
	 * Validate event structure
	 */
	static validate(event: IEvent) {
		if (typeof event !== 'object' || !event)
			throw new TypeError('event must be an Object');
		if (typeof event.type !== 'string' || !event.type.length)
			throw new TypeError('event.type must be a non-empty String');
		if (!event.aggregateId && !event.sagaId)
			throw new TypeError('either event.aggregateId or event.sagaId is required');
		if (event.sagaId && typeof event.sagaVersion === 'undefined')
			throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
	}

	static getId(event: IEvent): string {
		return event.id ?? md5(event);
	}
}
