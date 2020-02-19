/* eslint no-return-assign: "off", eqeqeq: "off", require-jsdoc: "off" */
'use strict';

const crypto = require('crypto');
const md5 = data => crypto.createHash('md5').update(JSON.stringify(data)).digest('base64').replace(/==$/, '');

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 *
 * @class InMemoryEventStorage
 * @implements {IEventStorage}
 */
class InMemoryEventStorage {

	constructor() {
		this._nextId = 0;

		// this._events = Promise.resolve([]);

		/** @type {Map<string, string[]>} */
		this._streams = new Map();

		/** @type {Map<string, IEvent>} */
		this._events = new Map();

		this._sequence = [];
	}

	/**
	 * @param {IEvent[]} events
	 * @returns {Promise<void>}
	 */
	async commitEvents(events) {
		for (const event of events) {
			const eventId = event.id || md5(event);
			const isNewEvent = !this._events.has(eventId);
			if (isNewEvent) {
				this._events.set(eventId, event);
				this._sequence.push(eventId);
				console.log(`events <-- ${eventId} (${event.type})`);
			}

			if (event.aggregateId)
				this._attachEventToStream(event.aggregateId, eventId);

			if (event.sagaId)
				this._attachEventToStream(event.sagaId, eventId);
		}
	}

	_attachEventToStream(streamId, eventId) {
		if (!this._streams.get(streamId))
			this._streams.set(streamId, []);

		const stream = this._streams.get(streamId);
		stream.push(eventId);
		console.log(`${streamId} <-- ${eventId}`);
	}

	/**
	 * @private
	 * @param {string} streamId
	 */
	async* _getStream(streamId) {
		const stream = this._streams.get(streamId);
		if (!stream)
			return;

		for (const eventId of stream)
			yield this._events.get(eventId);
	}

	/**
	 * @param {Identifier} aggregateId
	 * @param {object} [options]
	 * @param {IEvent} [options.snapshot]
	 * @returns {Promise<IEventStream>}
	 */
	async getAggregateEvents(aggregateId, { snapshot } = {}) {
		const events = [];
		for await (const e of this._getStream(aggregateId))
			events.push(e);
		return events;

		// const events = await this._events;

		// if (snapshot)
		// 	return events.filter(e => e.aggregateId == aggregateId && e.aggregateVersion > snapshot.aggregateVersion);

		// return events.filter(e => e.aggregateId == aggregateId);
	}

	/**
	 * @param {Identifier} sagaId
	 * @param {object} [options]
	 * @param {IEvent} [options.beforeEvent]
	 * @returns {Promise<IEventStream>}
	 */
	async getSagaEvents(sagaId, { beforeEvent }) {
		const events = [];
		for await (const e of this._getStream(sagaId))
			events.push(e);
		return events;

		// return this._events.then(events =>
		// 	events.filter(e =>
		// 		e.sagaId == sagaId
		// 		&& e.sagaVersion < beforeEvent.sagaVersion));
	}

	/**
	 * @param {string[]} eventTypes
	 * @returns {Promise<IEventStream>}
	 */
	async getEvents(eventTypes) {
		return this._sequence
			.map(id => this._events.get(id))
			.filter(e => !eventTypes || eventTypes.includes(e.type));

		// if (!eventTypes)
		// 	return this._events;

		// return this._events.then(events =>
		// 	events.filter(e => eventTypes.includes(e.type)));
	}

	/**
	 * @returns {number}
	 */
	getNewId() {
		this._nextId += 1;
		return this._nextId;
	}
}

module.exports = InMemoryEventStorage;
