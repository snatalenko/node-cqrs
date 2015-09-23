'use strict';

const AbstractAggregate = require('../index').AbstractAggregate;

class AggregateState {
	mutate() {}
}

class Aggregate extends AbstractAggregate {
	constructor(id, history) {
		super(id, new AggregateState(), history);
	}

	doSomething(payload, context) {
		this.emit('somethingDone', payload);
	}
}

class StatelessAggregate extends AbstractAggregate {

}

class FakeEventStore {
	constructor() {
		this.cnt = 1;
		this.events = [];
	}
	getNewId() {
		return this.cnt++;
	}
	getEvents(aggregateId) {
		return Promise.resolve(this.events);
	}
	commit(context, events) {
		this.events.push.apply(this.events, events);
		return Promise.resolve(events);
	}
}

exports.blankContext = {
	ip: '127.0.0.1',
	browser: 'test'
};


exports.Aggregate = Aggregate;
exports.StatelessAggregate = StatelessAggregate;
exports.FakeEventStore = FakeEventStore;
