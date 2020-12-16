'use strict';

import { Identifier, IEvent, IEventStorage, IEventStream, ILogger } from "../interfaces";
import * as crypto from 'crypto';

const md5 = (data: object): string => crypto
	.createHash('md5')
	.update(JSON.stringify(data))
	.digest('base64')
	.replace(/==$/, '');

type TEventFilter = {
	afterEvent?: IEvent,
	beforeEvent?: IEvent
}

function applyEventsFilter(eventIds: string[], filter?: TEventFilter): string[] {
	if (!filter)
		return eventIds;

	let start = 0;
	let end = eventIds.length;

	const { afterEvent, beforeEvent } = filter;
	if (afterEvent) {
		const eventId = afterEvent.id || md5(afterEvent);
		const eventIndex = eventIds.indexOf(eventId);
		if (eventIndex !== -1)
			start = eventIndex + 1;
	}
	if (beforeEvent) {
		const eventId = beforeEvent.id || md5(beforeEvent);
		const eventIndex = eventIds.indexOf(eventId);
		if (eventIndex !== -1)
			end = eventIndex;
	}

	return eventIds.slice(start, end);
}

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 */
export default class InMemoryEventStorage implements IEventStorage {

	#nextId: number = 0;
	#streams: Map<Identifier, string[]> = new Map();
	#events: Map<string, IEvent> = new Map();
	#sequence: string[] = [];
	#logger?: ILogger;

	/**
	 * Creates instance of InMemoryEventStorage
	 */
	constructor(options?: { logger?: ILogger }) {
		this.#logger = options?.logger;
	}

	/**
	 * Generate unique identifier
	 */
	getNewId(): number {
		this.#nextId += 1;
		return this.#nextId;
	}

	/**
	 * Save events to a stream with given ID
	 */
	async commit(streamId: Identifier, events: IEventStream): Promise<IEventStream> {
		/* istanbul ignore if */
		if (typeof streamId !== 'string' && typeof streamId !== 'number')
			throw new TypeError('streamId argument must be either a String or a Number');
		/* istanbul ignore if */
		if (!Array.isArray(events) || events.length === 0)
			throw new TypeError('events argument must be an Array');

		const newEvents = [];

		for (const event of events) {
			const eventId = event.id || md5(event);
			const isNewEvent = !this.#events.has(eventId);
			if (isNewEvent) {
				this.#events.set(eventId, event);
				this.#sequence.push(eventId);
				newEvents.push(event);

				this.#logger?.log('debug', `${eventId} (${event.type}) added to the store`, { service: this.constructor.name });
			}

			this._attachEventToStream(streamId, eventId);
		}

		return newEvents;
	}

	/**
	 * Append events to a stream by ID
	 */
	private _attachEventToStream(streamId: Identifier, eventId: string) {
		let stream = this.#streams.get(streamId);
		if (!stream) {
			stream = [];
			this.#streams.set(streamId, stream);
		}

		stream.push(eventId);

		this.#logger?.log('debug', `${eventId} added to stream ${streamId}`, { service: this.constructor.name });
	}

	/**
	 * Get event stream with a given ID
	 */
	async* getStream(streamId: Identifier, filter?: TEventFilter): AsyncIterableIterator<IEvent> {
		/* istanbul ignore if */
		if (typeof streamId !== 'string' && typeof streamId !== 'number')
			throw new TypeError('streamId argument must be either a String or a Number');

		const stream = this.#streams.get(streamId);
		if (!stream)
			return;

		for (const eventId of applyEventsFilter(stream, filter)) {
			const event = this.#events.get(eventId);
			/* istanbul ignore if */
			if (!event)
				throw new Error(`Event ${eventId} could not be found`);

			yield event;
		}
	}

	/**
	 * Get events by given event types
	 */
	async* getEventsByTypes(eventTypes: string[], filter?: TEventFilter): AsyncIterableIterator<IEvent> {
		/* istanbul ignore if */
		if (!Array.isArray(eventTypes) || !eventTypes.length)
			throw new TypeError('eventTypes argument must be an Array');

		for (const eventId of applyEventsFilter(this.#sequence, filter)) {
			const event = this.#events.get(eventId);
			/* istanbul ignore if */
			if (!event)
				throw new Error(`Event ${eventId} could not be found`);

			if (!eventTypes || eventTypes.includes(event.type))
				yield event;
		}
	}
}
