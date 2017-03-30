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
		eventStore = new EventStore();
		sinon.spy(eventStore, 'getNewId');
		sinon.spy(eventStore, 'getAggregateEvents');
		sinon.spy(eventStore, 'commit');

		commandBus = new CommandBus();
		sinon.spy(commandBus, 'on');
	});

	it('exports a class', () => {
		expect(AggregateCommandHandler).to.be.a('Function');
		expect(AggregateCommandHandler.toString().substr(0, 5)).to.eq('class');
	});

	it('subscribes to commands handled by Aggregate', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		handler.subscribe(commandBus);

		assert(commandBus.on.callCount === 2, 'commandBus.on was not called twice');

		{
			const { args } = commandBus.on.firstCall;
			expect(args[0]).to.eq('createAggregate');
			expect(args[1]).to.be.an('AsyncFunction');
		}

		{
			const { args } = commandBus.on.secondCall;
			expect(args[0]).to.eq('doSomething');
			expect(args[1]).to.be.an('AsyncFunction');
		}
	});

	it('requests aggregate ID from event store, when aggregate does not exist', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'createAggregate' });

		assert(eventStore.getNewId.calledOnce, 'getNewId was not called once');
	});

	it('restores aggregate from event store events', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		assert(eventStore.getAggregateEvents.calledOnce, 'getAggregateEvents was not called');

		const { args } = eventStore.getAggregateEvents.lastCall;
		expect(args).to.have.length(1);
	});

	it('passes commands to aggregate.handle(cmd)', async () => {

		const aggregate = new MyAggregate({ id: 1 });
		sinon.spy(aggregate, 'handle');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: () => aggregate
		});

		await handler.execute({ type: 'doSomething', payload: 'test' });

		const { args } = aggregate.handle.lastCall;
		expect(args[0]).to.have.property('type', 'doSomething');
		expect(args[0]).to.have.property('payload', 'test');
	});

	it('resolves to produced events', async () => {
		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		const events = await handler.execute({ type: 'doSomething', aggregateId: 1 });

		expect(events).to.have.length(1);
		expect(events[0]).to.have.property('type', 'somethingDone');
	});

	it('commits produced events to eventStore', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		assert(eventStore.commit.calledOnce, 'commit was not called');

		const { args } = eventStore.commit.lastCall;
		expect(args[0]).to.be.an('Array');
	});
});
