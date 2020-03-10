'use strict';

const { expect, assert } = require('chai');
const sinon = require('sinon');

const {
	AggregateCommandHandler,
	AbstractAggregate,
	InMemoryEventStorage,
	EventStore,
	InMemoryMessageBus
} = require('../../src');

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class MyAggregate extends AbstractAggregate {
	static get handles() {
		return ['createAggregate', 'doSomething'];
	}
	constructor({ id, events }) {
		super({ id, state: {}, events });
	}
	async createAggregate() {
		await delay(100);
		this.emit('created');
	}
	async doSomething() {
		await delay(100);
		this.emit('somethingDone');
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

	let storage;
	let eventStore;
	let commandBus;

	beforeEach(() => {
		storage = new InMemoryEventStorage();
		const messageBus = new InMemoryMessageBus();

		eventStore = new EventStore({ storage, messageBus });
		sinon.spy(eventStore, 'getNewId');
		sinon.spy(eventStore, 'getStream');
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

		expect(commandBus.on).to.have.property('callCount', 2);

		{
			const { args } = commandBus.on.firstCall;
			expect(args[0]).to.eq('createAggregate');
			expect(args[1]).to.be.instanceOf(Function);
		}

		{
			const { args } = commandBus.on.secondCall;
			expect(args[0]).to.eq('doSomething');
			expect(args[1]).to.be.instanceOf(Function);
		}
	});

	it('requests aggregate ID from event store, when aggregate does not exist', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'createAggregate' });

		assert(eventStore.getNewId.calledOnce, 'getNewId was not called once');
	});

	it('pulls aggregate event stream', async () => {

		const aggregateId = 1;

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId });

		assert(eventStore.getStream.calledOnce, 'getStream was not called');

		const { args } = eventStore.getStream.lastCall;
		expect(args[0]).to.eql(aggregateId);
	});

	it('passes commands to aggregate.handle(cmd)', async () => {

		const aggregate = new MyAggregate({ id: 1 });
		sinon.spy(aggregate, 'handle');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: () => aggregate,
			handles: ['somethingHappened']
		});

		await handler.execute({ type: 'doSomething', payload: 'test' });

		const { args } = aggregate.handle.lastCall;
		expect(args[0]).to.have.property('type', 'doSomething');
		expect(args[0]).to.have.property('payload', 'test');
	});

	it('attaches command context, sagaId, sagaVersion to produced events', async () => {

		const aggregate = new MyAggregate({ id: 1 });

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: () => aggregate,
			handles: ['somethingHappened']
		});

		const sagaId = 'saga-1';
		const sagaVersion = 1;
		const context = { ip: 'localhost' };
		const command = { type: 'doSomething', payload: 'test', context, sagaId, sagaVersion };

		const events = await handler.execute(command);

		expect(events[0]).to.have.property('context', context);
		expect(events[0]).to.have.property('sagaId', sagaId);
		expect(events[0]).to.have.property('sagaVersion', sagaVersion);
	});

	it('resolves to produced events', async () => {
		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		const events = await handler.execute({ type: 'doSomething', aggregateId: 1 });

		expect(events).to.have.length(1);
		expect(events[0]).to.have.property('type', 'somethingDone');
	});

	it('commits produced events to eventStore', async () => {

		const aggregateId = 1;
		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId });

		assert(eventStore.commit.calledOnce, 'commit was not called');

		const { args } = eventStore.commit.lastCall;
		expect(args[0]).to.eq(aggregateId);
		expect(args[1]).to.be.an('Array');
	});

	it('invokes aggregate.makeSnapshot when get shouldTakeSnapshot equals true', async () => {

		// setup

		const aggregate = new MyAggregate({ id: 1 });
		Object.defineProperty(aggregate, 'shouldTakeSnapshot', { configurable: true, value: false });
		sinon.spy(aggregate, 'makeSnapshot');

		const handler = new AggregateCommandHandler({
			eventStore,
			snapshotStorage: { saveSnapshot() { }, getSnapshot() { } },
			aggregateType: () => aggregate,
			handles: ['somethingHappened']
		});

		// test

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('makeSnapshot.called', false);

		Object.defineProperty(aggregate, 'shouldTakeSnapshot', { configurable: true, value: true });

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('makeSnapshot.called', true);
	});

	it.skip('executes concurrent commands on same aggregate instance', async () => {

		// setup

		class PersistedAggregate extends MyAggregate {
			get shouldTakeSnapshot() {
				return this.version > 2;
			}
		}

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: PersistedAggregate });

		sinon.spy(storage, 'getAggregateEvents');
		sinon.spy(storage, 'commitEvents');
		sinon.spy(storage, 'saveAggregateSnapshot');

		// test

		const cmd0 = { type: 'createAggregate' };

		const [{ aggregateId }] = await handler.execute(cmd0);

		expect(storage).to.have.nested.property('getAggregateEvents.callCount', 0);
		expect(storage).to.have.nested.property('commitEvents.callCount', 1);
		expect(storage).to.have.nested.property('saveAggregateSnapshot.callCount', 0);

		const cmd1 = { aggregateId, type: 'doSomething' };
		const cmd2 = { aggregateId, type: 'doSomething' };
		const cmd3 = { aggregateId, type: 'doSomething' };

		await Promise.all([cmd1, cmd2, cmd3].map(c => handler.execute(c)));

		// expect(storage).to.have.nested.property('getAggregateEvents.callCount', 1);
		// expect(storage).to.have.nested.property('commitEvents.callCount', 2);
		// expect(storage).to.have.nested.property('saveAggregateSnapshot.callCount', 2);

		const events = await eventStore.getAggregateEvents(aggregateId);

		expect(events).to.have.length(4);
		expect(events[0]).to.have.property('type', 'snapshot');
		expect(events[0]).to.have.property('aggregateVersion', 1);
		expect(events[1]).to.have.property('aggregateVersion', 2);
		expect(events[2]).to.have.property('aggregateVersion', 3);
		expect(events[3]).to.have.property('aggregateVersion', 4);
	});
});
