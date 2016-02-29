'use strict';

const cqrs = require('..');

class MyAggregate extends cqrs.AbstractAggregate {

	static get handles() {
		return ['doSomething'];
	}

	_doSomething(payload, context) {
		this.emit('somethingDone', {});
	}
}


const commandBus = new cqrs.CommandBus();
const storage = new cqrs.InMemoryEventStorage();
const eventStore = new cqrs.EventStore({ storage });


const aggregateCommandHandler = new cqrs.AggregateCommandHandler({
	eventStore: eventStore,
	aggregateType: MyAggregate
});

aggregateCommandHandler.subscribe(commandBus);
