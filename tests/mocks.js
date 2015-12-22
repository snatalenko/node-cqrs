'use strict';

const AbstractAggregate = require('../index').AbstractAggregate;

class AggregateState {
	mutate() {}
}

exports.blankContext = {
	ip: '127.0.0.1',
	browser: 'test',
	serverTime: Date.now()
};

exports.Aggregate = class Aggregate extends AbstractAggregate {
	constructor(id, history) {
		super(id, new AggregateState(), history);
	}

	doSomething(payload, context) {
		this.emit('somethingDone', payload);
	}

	doSomethingWrong(payload, context) {
		throw new Error('something went wrong');
	}
};

exports.StatelessAggregate = class StatelessAggregate extends AbstractAggregate {

};

exports.InMemoryEventStoreGateway = class InMemoryEventStoreGateway {
	constructor() {
		this.events = [];
		this.nextId = 1;
	}
	commitEvents(events) {
		this.events.push.apply(this.events, events);
	}
	getAggregateEvents(aggregateId) {
		return this.events.filter(e => e.aggregateId === aggregateId);
	}
	getEvents(eventTypes) {
		return this.events.filter(e => eventTypes.indexOf(e.type) !== -1);
	}
	getNewId() {
		return this.nextId++;
	}
};

