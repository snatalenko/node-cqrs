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

	getSagaEvents(sagaId) {
		return this._events.then(events =>
			events.filter(e => e.sagaId == sagaId));
	}

	getEvents(eventTypes) {
		if (!eventTypes)
			return this._events;
		else
			return this._events.then(events =>
				events.filter(e => eventTypes.indexOf(e.type) !== -1));
	}

	getNewId() {
		return ++this.nextId;
	}
};
