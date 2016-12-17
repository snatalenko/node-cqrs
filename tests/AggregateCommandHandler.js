'use strict';

const { AggregateCommandHandler, AbstractAggregate } = require('..');

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class MyAggregate extends AbstractAggregate {
	static get handles() {
		return ['createAggregate', 'doSomething'];
	}
	createAggregate() {
		return delay(100).then(() => {
			this.emit('created');
		});
	}
	doSomething() {
		return delay(100).then(() => {
			this.emit('somethingDone');
		});
	}
}

class EventStore {
	getNewId() {
		return Promise.resolve('test-aggregate-id');
	}
	getAggregateEvents(aggregateId) {
		return [{ type: 'aggregateCreated', aggregateId }];
	}
	commit(events) {
		if (!this.committed) this.committed = [];
		this.committed.push(...events);
		return Promise.resolve(events);
	}
}

class CommandBus {
	on(messageType, listener) {
		if (!this.handlers) this.handlers = {};
		this.handlers[messageType] = listener;
	}
}

describe('AggregateCommandHandler', function () {

	this.timeout(500);
	this.slow(300);

	let eventStore;
	let commandBus;

	beforeEach(() => {
		eventStore = logRequests(new EventStore());
		commandBus = logRequests(new CommandBus());
	});

	it('exports a class', () => {
		expect(AggregateCommandHandler).to.be.a('Function');
		expect(AggregateCommandHandler.toString().substr(0, 5)).to.eq('class');
	});

	it('subscribes to commands handled by Aggregate', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		handler.subscribe(commandBus);

		expect(commandBus).to.have.deep.property('requests[0].name', 'on');
		expect(commandBus).to.have.deep.property('requests[0].args[0]', 'createAggregate');
		expect(commandBus).to.have.deep.property('requests[0].args[1]').that.is.a('Function');

		expect(commandBus).to.have.deep.property('requests[1].name', 'on');
		expect(commandBus).to.have.deep.property('requests[1].args[0]', 'doSomething');
		expect(commandBus).to.have.deep.property('requests[1].args[1]').that.is.a('Function');
	});

	it('requests aggregate ID from event store, when aggregate does not exist', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		return handler.execute({ type: 'createAggregate' })
			.then(r => {
				expect(eventStore).to.have.deep.property('requests[0].name', 'getNewId');
				expect(eventStore).to.have.deep.property('requests[0].args').that.have.length(0);
			});
	});

	it('restores aggregate from event store events', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		return handler.execute({ type: 'doSomething', aggregateId: 1 })
			.then(r => {
				expect(eventStore).to.have.deep.property('requests[0].name', 'getAggregateEvents');
				expect(eventStore).to.have.deep.property('requests[0].args[0]', 1);
			});
	});

	it('passes commands to aggregate.handle(cmd)', () => {

		const aggregate = logRequests(new MyAggregate({ id: 1 }));
		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: () => aggregate
		});

		return handler.execute({ type: 'doSomething', payload: 'test' })
			.then(r => {
				expect(aggregate).to.have.deep.property('requests[0].name', 'handle');
				expect(aggregate).to.have.deep.property('requests[0].args[0].type', 'doSomething');
				expect(aggregate).to.have.deep.property('requests[0].args[0].payload', 'test');
			});
	});

	it('resolves to produced events', () => {
		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		return handler.execute({ type: 'doSomething', aggregateId: 1 })
			.then(events => {
				expect(events).to.have.length(1);
				expect(events[0]).to.have.property('type', 'somethingDone');
			});
	});

	it('commits produced events to eventStore', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		return handler.execute({ type: 'doSomething', aggregateId: 1 })
			.then(r => {
				expect(eventStore).to.have.deep.property('requests[1].name', 'commit');
				expect(eventStore).to.have.deep.property('requests[1].args[0]').that.is.an('Array');
			});
	});
});
