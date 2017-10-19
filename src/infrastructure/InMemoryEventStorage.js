/* eslint no-return-assign: "off", eqeqeq: "off", require-jsdoc: "off" */
'use strict';

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 *
 * @class InMemoryEventStorage
 * @implements {IEventStorage}
 */
module.exports = class InMemoryEventStorage {

	constructor() {
		this._nextId = 0;
		this._events = Promise.resolve([]);
	}

	commitEvents(events) {
		return this._events = this._events.then(data =>
			data.concat(events));
	}

	async getAggregateEvents(aggregateId, { snapshot } = {}) {
		const events = await this._events;

		if (snapshot)
			return events.filter(e => e.aggregateId == aggregateId && e.aggregateVersion > snapshot.aggregateVersion);

		return events.filter(e => e.aggregateId == aggregateId);
	}

	getSagaEvents(sagaId, { beforeEvent }) {
		return this._events.then(events =>
			events.filter(e =>
				e.sagaId == sagaId
				&& e.sagaVersion < beforeEvent.sagaVersion));
	}

	getEvents(eventTypes) {
		if (!eventTypes)
			return this._events;

		return this._events.then(events =>
			events.filter(e => eventTypes.includes(e.type)));
	}

	getNewId() {
		this._nextId += 1;
		return this._nextId;
	}
};
