'use strict';

const KEY_EVENTS = Symbol();

module.exports = class InMemoryEventStoreGateway {

	get events() {
		return this[KEY_EVENTS];
	}

	constructor() {
		this.nextId = 0;
		this[KEY_EVENTS] = Promise.resolve([]);
	}

	commitEvents(events) {
		this[KEY_EVENTS] = this.events.then(data =>
			data.concat(events));
	}

	getAggregateEvents(aggregateId) {
		return this.events.then(events =>
			events.filter(e => e.aggregateId === aggregateId));
	}

	getEvents(eventTypes) {
		if (!eventTypes)
			return this.events;
		else
			return this.events.then(events =>
				events.filter(e => eventTypes.indexOf(e.type) !== -1));
	}

	getNewId() {
		return ++this.nextId;
	}
};
