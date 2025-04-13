import { expect, assert } from 'chai';
import * as sinon from 'sinon';
import {
	EventDispatcher,
	ICommandBus,
	Identifier,
	IEventBus,
	IEventSet,
	IEventStore,
	InMemoryMessageBus,
	AggregateCommandHandler,
	AbstractAggregate,
	InMemoryEventStorage,
	EventStore,
	InMemorySnapshotStorage
} from '../../src';

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class MyAggregate extends AbstractAggregate<any> {
	static get handles() {
		return ['createAggregate', 'doSomething'];
	}
	constructor({ id, events }: { id: Identifier, events?: IEventSet }) {
		super({ id, state: {}, events });
	}
	async createAggregate() {
		await delay(5);
		this.emit('created');
	}
	async doSomething() {
		await delay(5);
		this.emit('somethingDone');
	}
}

class CommandBus {
	handlers: any = {};
	on(messageType, listener) {
		this.handlers[messageType] = listener;
	}
}

describe('AggregateCommandHandler', function () {

	// this.timeout(500);
	// this.slow(300);

	let eventStorageReader: InMemoryEventStorage;
	let snapshotStorage: InMemorySnapshotStorage;
	let eventStore: IEventStore;
	let commandBus: ICommandBus;
	let eventBus: IEventBus;
	let onSpy;
	let getNewIdSpy;
	let getAggregateEventsSpy;
	let commitSpy;

	beforeEach(() => {
		eventBus = new InMemoryMessageBus();
		eventStorageReader = new InMemoryEventStorage();
		snapshotStorage = new InMemorySnapshotStorage();
		const eventDispatcher = new EventDispatcher({ eventBus });

		eventStore = new EventStore({
			eventStorageReader,
			snapshotStorage,
			eventBus,
			eventDispatcher,
			identifierProvider: eventStorageReader
		});
		getNewIdSpy = sinon.spy(eventStore, 'getNewId');
		getAggregateEventsSpy = sinon.spy(eventStore, 'getAggregateEvents');
		commitSpy = sinon.spy(eventStore, 'dispatch');

		commandBus = new CommandBus() as any;
		onSpy = sinon.spy(commandBus, 'on');
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
			const { args } = onSpy.firstCall;
			expect(args[0]).to.eq('createAggregate');
			expect(args[1]).to.be.instanceOf(Function);
		}

		{
			const { args } = onSpy.secondCall;
			expect(args[0]).to.eq('doSomething');
			expect(args[1]).to.be.instanceOf(Function);
		}
	});

	it('requests aggregate ID from event store, when aggregate does not exist', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'createAggregate' });

		assert(getNewIdSpy.calledOnce, 'getNewId was not called once');
	});

	it('restores aggregate from event store events', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		assert(getAggregateEventsSpy.calledOnce, 'getAggregateEvents was not called');

		const { args } = getAggregateEventsSpy.lastCall;
		expect(args).to.have.length(1);
	});

	it('passes commands to aggregate.handle(cmd)', async () => {

		const aggregate = new MyAggregate({ id: 1 });
		const handleSpy = sinon.spy(aggregate, 'handle');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory: () => aggregate,
			handles: MyAggregate.handles
		});

		await handler.execute({ type: 'doSomething', payload: 'test' });

		const { args } = handleSpy.lastCall;
		expect(args[0]).to.have.property('type', 'doSomething');
		expect(args[0]).to.have.property('payload', 'test');
	});

	it('attaches command context, sagaId, sagaVersion to produced events', async () => {

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: MyAggregate
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

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		assert(commitSpy.calledOnce, 'commit was not called');

		const { args } = commitSpy.lastCall;
		expect(args[0]).to.be.an('Array');
	});

	it('invokes aggregate.takeSnapshot before committing event stream, when get shouldTakeSnapshot equals true', async () => {

		// setup

		const aggregate = new MyAggregate({ id: 1 });
		Object.defineProperty(aggregate, 'shouldTakeSnapshot', {
			// take snapshot every other event
			get() {
				return this.version !== 0 && this.version % 2 === 0;
			}
		});
		sinon.spy(aggregate, 'takeSnapshot');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory: () => aggregate,
			handles: MyAggregate.handles
		});

		// test

		expect(aggregate).to.have.nested.property('takeSnapshot.called', false);
		expect(aggregate).to.have.property('version', 0);

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('takeSnapshot.called', false);
		expect(aggregate).to.have.property('version', 1); // 1st event

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('takeSnapshot.called', true);
		expect(aggregate).to.have.property('version', 3); // 2nd event and snapshot

		const [eventStream] = commitSpy.lastCall.args;

		expect(eventStream).to.have.length(3);
		expect(eventStream[2]).to.have.property('type', 'snapshot');
		expect(eventStream[2]).to.have.property('aggregateVersion', 2);
		expect(eventStream[2]).to.have.property('payload');
	});
});
