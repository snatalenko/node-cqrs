'use strict';

const crypto = require('crypto');
const nullLogger = require('../utils/nullLogger');

/**
 * @param {object} data
 * @returns {string}
 */
const md5 = data => crypto
	.createHash('md5')
	.update(JSON.stringify(data))
	.digest('base64')
	.replace(/==$/, '');

/**
 * @param {string[]} eventIds
 * @param {object} [filter]
 * @param {IEvent} [filter.afterEvent]
 * @param {IEvent} [filter.beforeEvent]
 * @returns {string[]}
 */
function applyEventsFilter(eventIds, filter) {
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
 *
 * @class InMemoryEventStorage
 * @implements {IEventStorage}
 */
class InMemoryEventStorage {

	/**
	 * Creates instance of InMemoryEventStorage
	 *
	 * @param {object} [options]
	 * @param {ILogger} [options.logger]
	 */
	constructor(options) {
		this._nextId = 0;

		/** @type {Map<string | number, string[]>} */
		this._streams = new Map();

		/** @type {Map<string, IEvent>} */
		this._events = new Map();

		/** @type {string[]} */
		this._sequence = [];

		this._logger = (options && options.logger) || nullLogger;
	}

	/**
	 * Generate unique identifier
	 *
	 * @returns {number}
	 */
	getNewId() {
		this._nextId += 1;
		return this._nextId;
	}

	/**
	 * Save events to a stream with given ID
	 *
	 * @param {Identifier} streamId
	 * @param {IEventStream} events
	 * @returns {Promise<IEventStream>}
	 */
	async commit(streamId, events) {
		/* istanbul ignore if */
		if (typeof streamId !== 'string' && typeof streamId !== 'number')
			throw new TypeError('streamId argument must be either a String or a Number');
		/* istanbul ignore if */
		if (!Array.isArray(events) || events.length === 0)
			throw new TypeError('events argument must be an Array');

		const newEvents = [];

		for (const event of events) {
			const eventId = event.id || md5(event);
			const isNewEvent = !this._events.has(eventId);
			if (isNewEvent) {
				this._events.set(eventId, event);
				this._sequence.push(eventId);
				newEvents.push(event);

				this._logger.log('debug', `${eventId} (${event.type}) added to the store`, { service: this.constructor.name });
			}

			this._attachEventToStream(streamId, eventId);
		}

		return newEvents;
	}

	/**
	 * Append events to a stream by ID
	 *
	 * @private
	 * @param {Identifier} streamId
	 * @param {string} eventId
	 */
	_attachEventToStream(streamId, eventId) {
		let stream = this._streams.get(streamId);
		if (!stream) {
			stream = [];
			this._streams.set(streamId, stream);
		}

		stream.push(eventId);

		this._logger.log('debug', `${eventId} added to stream ${streamId}`, { service: this.constructor.name });
	}

	/**
	 * Get event stream with a given ID
	 *
	 * @param {Identifier} streamId
	 * @param {object} [filter]
	 * @param {IEvent} [filter.afterEvent]
	 * @param {IEvent} [filter.beforeEvent]
	 * @returns {AsyncIterableIterator<IEvent>}
	 */
	async* getStream(streamId, filter) {
		/* istanbul ignore if */
		if (typeof streamId !== 'string' && typeof streamId !== 'number')
			throw new TypeError('streamId argument must be either a String or a Number');

		const stream = this._streams.get(streamId);
		if (!stream)
			return;

		for (const eventId of applyEventsFilter(stream, filter)) {
			const event = this._events.get(eventId);
			/* istanbul ignore if */
			if (!event)
				throw new Error(`Event ${eventId} could not be found`);

			yield event;
		}
	}

	/**
	 * Get events by given event types
	 *
	 * @param {string[]} eventTypes
	 * @param {object} [filter]
	 * @param {IEvent} [filter.afterEvent]
	 * @param {IEvent} [filter.beforeEvent]
	 * @returns {AsyncIterableIterator<IEvent>}
	 */
	async* getEventsByTypes(eventTypes, filter) {
		/* istanbul ignore if */
		if (!Array.isArray(eventTypes) || !eventTypes.length)
			throw new TypeError('eventTypes argument must be an Array');

		for (const eventId of applyEventsFilter(this._sequence, filter)) {
			const event = this._events.get(eventId);
			/* istanbul ignore if */
			if (!event)
				throw new Error(`Event ${eventId} could not be found`);

			if (!eventTypes || eventTypes.includes(event.type))
				yield event;
		}
	}
}

module.exports = InMemoryEventStorage;
