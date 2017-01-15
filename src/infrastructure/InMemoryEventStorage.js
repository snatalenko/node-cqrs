/* eslint no-return-assign: "off", eqeqeq: "off" */
'use strict';

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 */
module.exports = class InMemoryEventStorage {

	constructor() {
		this.nextId = 0;
		this._events = Promise.resolve([]);
	}

	commitEvents(events) {
		return this._events = this._events.then(data =>
			data.concat(events));
	}

	getAggregateEvents(aggregateId) {
		return this._events.then(events =>
			events.filter(e => e.aggregateId == aggregateId));
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
		this.nextId += 1;
		return this.nextId;
	}
};
