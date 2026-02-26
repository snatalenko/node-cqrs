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
	InMemorySnapshotStorage,
	ConcurrencyError
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

class SelectiveRestoreAggregate extends AbstractAggregate<any> {
	static get handles() {
		return ['do'];
	}

	static get restoresFrom() {
		return ['stateEvent'];
	}

	constructor({ id }: { id: Identifier }) {
		super({
			id,
			state: {
				stateEvent() { }
			}
		});
	}

	do() {
		this.emit('newEvent');
	}
}

class CommandBus {
	handlers: any = {};
	on(messageType, listener) {
		this.handlers[messageType] = listener;
	}
	off() { }
}

describe('AggregateCommandHandler', function () {

	// this.timeout(500);
	// this.slow(300);

	let eventStorage: InMemoryEventStorage;
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
		eventStorage = new InMemoryEventStorage();
		snapshotStorage = new InMemorySnapshotStorage();
		const eventDispatcher = new EventDispatcher({
			eventDispatchPipeline: [
				eventStorage
			],
			eventBus
		});

		eventStore = new EventStore({
			eventStorageReader: eventStorage,
			snapshotStorage,
			eventBus,
			eventDispatcher,
			identifierProvider: eventStorage
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
		expect(args[0]).to.eql(1);
	});

	it('can restore from filtered event types while keeping aggregate version via tail event', async () => {
		const aggregateId = 'restore-filter-test-id';

		await eventStore.dispatch([
			{ aggregateId, aggregateVersion: 0, type: 'stateEvent' },
			{ aggregateId, aggregateVersion: 1, type: 'irrelevant' },
			{ aggregateId, aggregateVersion: 2, type: 'irrelevant' }
		] as any);

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: SelectiveRestoreAggregate });

		const events = await handler.execute({ type: 'do', aggregateId });

		assert(getAggregateEventsSpy.called, 'getAggregateEvents was not called');
		expect(getAggregateEventsSpy.lastCall.args).to.eql([
			aggregateId,
			{ eventTypes: ['stateEvent'], tail: 'last' }
		]);

		expect(events[0]).to.have.property('aggregateVersion', 3);
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

	it('attaches command context and sagaOrigins to produced events', async () => {

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: MyAggregate
		});

		const sagaOrigins = {
			SagaA: 'origin-a',
			SagaB: 'origin-b'
		};
		const context = { ip: 'localhost' };
		const command = { type: 'doSomething', payload: 'test', context, sagaOrigins };

		const events = await handler.execute(command);

		expect(events[0]).to.have.property('context', context);
		expect(events[0]).to.have.property('sagaOrigins').that.eqls(sagaOrigins);
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

	it('invokes aggregate.makeSnapshot before committing event stream, when get shouldTakeSnapshot equals true', async () => {

		// setup

		const aggregate = new MyAggregate({ id: 1 });
		Object.defineProperty(aggregate, 'shouldTakeSnapshot', {
			// take snapshot every other event
			get() {
				return this.version !== 0 && this.version % 2 === 0;
			}
		});
		sinon.spy(aggregate, 'makeSnapshot');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory: () => aggregate,
			handles: MyAggregate.handles
		});

		// test

		expect(aggregate).to.have.nested.property('makeSnapshot.called', false);
		expect(aggregate).to.have.property('version', 0);

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('makeSnapshot.called', false);
		expect(aggregate).to.have.property('version', 1); // 1st event

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(aggregate).to.have.nested.property('makeSnapshot.called', true);
		expect(aggregate).to.have.property('version', 3); // 2nd event and snapshot

		const [eventStream] = commitSpy.lastCall.args;

		expect(eventStream).to.have.length(2);
		expect(eventStream[1]).to.have.property('type', 'snapshot');
		expect(eventStream[1]).to.have.property('aggregateVersion', 2);
		expect(eventStream[1]).to.have.property('payload');
	});

	it('produces events with sequential versions for concurrent commands to the same aggregate', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });
		const aggregateId = 'concurrent-test-id';

		// Ensure aggregate exists
		await handler.execute({ type: 'createAggregate', aggregateId });

		const command1 = { type: 'doSomething', aggregateId };
		const command2 = { type: 'doSomething', aggregateId };

		// Execute commands concurrently
		await Promise.all([
			handler.execute(command1),
			handler.execute(command2)
		]);

		// Retrieve all events for the aggregate
		const eventsIterable = eventStore.getAggregateEvents(aggregateId);
		const allEvents = [];
		for await (const event of eventsIterable)
			allEvents.push(event);

		const emittedEventVersions = allEvents.map(e => e.aggregateVersion);
		expect(emittedEventVersions).to.deep.equal([0, 1, 2]);
	});

	it('uses cached aggregate instance for concurrent commands and restores for subsequent commands', async () => {

		const aggregateId = 'cache-test-id';
		let factoryCallCount = 0;
		const aggregateFactory = params => {
			factoryCallCount++;
			return new MyAggregate(params);
		};

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory,
			handles: MyAggregate.handles
		});

		// Ensure aggregate exists
		await handler.execute({ type: 'createAggregate', aggregateId });

		// Reset spies/counters before the main test part
		getAggregateEventsSpy.resetHistory();
		factoryCallCount = 0;

		const command1 = { type: 'doSomething', aggregateId };
		const command2 = { type: 'doSomething', aggregateId };

		// Execute commands concurrently
		await Promise.all([
			handler.execute(command1),
			handler.execute(command2)
		]);

		// Check that restore and factory were called only once for the concurrent pair
		assert(getAggregateEventsSpy.calledOnce, 'getAggregateEvents should be called once for concurrent commands');
		expect(factoryCallCount).to.equal(1, 'Aggregate factory should be called once for concurrent commands');


		getAggregateEventsSpy.resetHistory();
		factoryCallCount = 0;

		// Execute a third command after the first two completed
		const command3 = { type: 'doSomething', aggregateId };
		await handler.execute(command3);

		// Check that restore and factory were called again for the subsequent command
		assert(getAggregateEventsSpy.calledOnce, 'getAggregateEvents should be called again for the subsequent command');
		expect(factoryCallCount).to.equal(1, 'Aggregate factory should be called again for the subsequent command');
	});

	describe('retryOnConcurrencyError', () => {

		it('retries on ConcurrencyError and succeeds on retry (default behavior)', async () => {

			const aggregateId = 'retry-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: MyAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			// Make dispatch fail once with ConcurrencyError, then succeed
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy.restore();
			commitSpy = sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?) => {
				dispatchCallCount++;
				if (dispatchCallCount === 1) // fail on first attempt
					throw new ConcurrencyError();

				return originalDispatch(events, meta);
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).to.have.length(1);
			expect(events[0]).to.have.property('type', 'somethingDone');
			expect(dispatchCallCount).to.equal(2); // failed once, succeeded on retry
		});

		it('stops retrying after max attempts and throws ConcurrencyError', async () => {

			const aggregateId = 'retry-max-test-id';

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: MyAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			// Make dispatch always fail with ConcurrencyError
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').rejects(new ConcurrencyError());

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);
			}
		});

		it('does not retry when retryOnConcurrencyError is false', async () => {

			class NoRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = false as const;
			}

			const aggregateId = 'no-retry-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: NoRetryAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);
				expect(dispatchCallCount).to.equal(1);
			}
		});

		it('retries up to specified number when retryOnConcurrencyError is a number', async () => {

			class LimitedRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = 2;
			}

			const aggregateId = 'limited-retry-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: LimitedRetryAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);

				// retryOnConcurrencyError=2 means 2 retry attempts = 3 total dispatch calls
				expect(dispatchCallCount).to.equal(3);
			}
		});

		it('retries up to maxRetries when retryOnConcurrencyError is a config object', async () => {

			class ConfigRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = {
					maxRetries: 2
				};
			}

			const aggregateId = 'config-retry-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: ConfigRetryAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);
				expect(dispatchCallCount).to.equal(3); // 2 retries + initial attempt
			}
		});

		it('throws when retryOnConcurrencyError config is invalid', () => {

			class InvalidRetryConfigAggregate extends MyAggregate {
				static retryOnConcurrencyError = {
					maxRetries: -1
				} as any;
			}

			expect(() => new AggregateCommandHandler({
				eventStore,
				aggregateType: InvalidRetryConfigAggregate
			})).to.throw(TypeError, 'retryOnConcurrencyError.maxRetries must be a non-negative integer');
		});

		it('uses custom function resolver for retry decision', async () => {

			const retryDecisions: Array<{ err: unknown, attempt: number }> = [];

			class CustomRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = (err: unknown, events, attempt: number) => {
					retryDecisions.push({ err, attempt });
					return attempt < 1; // retry once (allow on attempt 0 only)
				};
			}

			const aggregateId = 'custom-retry-test-id';

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: CustomRetryAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').rejects(new ConcurrencyError('test conflict'));

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);
				expect(retryDecisions).to.have.length(2);
				expect(retryDecisions[0].attempt).to.equal(0);
				expect(retryDecisions[1].attempt).to.equal(1);
			}
		});

		it('allows custom retry resolver to return "ignore"', async () => {

			class IgnoreRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = (_err: unknown, events, attempt: number) =>
					(attempt < 1 ? true : 'ignore');
			}

			const aggregateId = 'custom-ignore-retry-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: IgnoreRetryAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).to.have.length(1);
			expect(dispatchCallCount).to.equal(3); // 2 regular attempts + ignored concurrency check
			expect(ignoredDispatchMeta).to.include({
				ignoreConcurrencyError: true
			});
		});

		it('ignores concurrency errors when retryOnConcurrencyError is set to "ignore"', async () => {

			class IgnoreByOptionAggregate extends MyAggregate {
				static retryOnConcurrencyError = 'ignore' as const;
			}

			const aggregateId = 'ignore-option-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: IgnoreByOptionAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).to.have.length(1);
			expect(dispatchCallCount).to.equal(2); // initial failure + ignored concurrency check
			expect(ignoredDispatchMeta).to.include({
				ignoreConcurrencyError: true
			});
		});

		it('does not retry non-ConcurrencyError errors', async () => {

			const aggregateId = 'non-concurrency-error-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: MyAggregate
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async () => {
				dispatchCallCount++;
				throw new Error('some other error');
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected error to be thrown');
			}
			catch (err: any) {
				expect(err.message).to.equal('some other error');
				expect(dispatchCallCount).to.equal(1);
			}
		});

		it('ignores concurrency error after retries are exhausted when retryOnConcurrencyError config enables ignoreAfterMaxRetries', async () => {

			class IgnoreOnExhaustedRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = {
					maxRetries: 1,
					ignoreAfterMaxRetries: true
				};
			}

			const aggregateId = 'force-store-type-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: IgnoreOnExhaustedRetryAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).to.have.length(1);
			expect(events[0]).to.have.property('type', 'somethingDone');
			expect(dispatchCallCount).to.equal(3); // 2 regular attempts + ignored concurrency check
			expect(ignoredDispatchMeta).to.include({
				ignoreConcurrencyError: true
			});
		});

		it('commits events produced before failure; 2nd+3rd execute against same re-created aggregate instance', async () => {

			const aggregateId = 'concurrent-retry-test-id';
			let nextInstanceId = 0;

			class TrackedAggregate extends MyAggregate {
				readonly instanceId = nextInstanceId++;

				override async doSomething(payload?: { cmdId: string }) {
					await delay(5);
					this.emit('somethingDone', { instanceId: this.instanceId, cmdId: payload?.cmdId });
				}
			}

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: TrackedAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			// Fail only dispatch for the 2nd command (attempt 0), then let all others through
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			let dispatchCallCount = 0;
			let failedDispatchCmdId: string | undefined;
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?) => {
				dispatchCallCount++;
				if (dispatchCallCount === 2) {
					failedDispatchCmdId = (events as any)?.[0]?.payload?.cmdId;
					throw new ConcurrencyError();
				}

				return originalDispatch(events, meta);
			});

			const cmd1Id = 'cmd-1';
			const cmd2Id = 'cmd-2';
			const cmd3Id = 'cmd-3';

			const cmd1 = { type: 'doSomething', aggregateId, payload: { cmdId: cmd1Id } };
			const cmd2 = { type: 'doSomething', aggregateId, payload: { cmdId: cmd2Id } };
			const cmd3 = { type: 'doSomething', aggregateId, payload: { cmdId: cmd3Id } };

			await Promise.all([handler.execute(cmd1), handler.execute(cmd2), handler.execute(cmd3)]);

			// cmd2 failed once, retried, cmd1+cmd3 executed — 4 dispatch calls total
			expect(dispatchCallCount).to.equal(4);
			expect(failedDispatchCmdId).to.equal(cmd2Id, 'the failed dispatch must correspond to the 2nd command');

			// Collect committed somethingDone events
			const allEvents = [];
			for await (const event of eventStore.getAggregateEvents(aggregateId))
				allEvents.push(event);
			const doneEvents = allEvents.filter(e => e.type === 'somethingDone');
			expect(doneEvents).to.have.length(3);

			// Verify events produced before failure were committed (cmd1 stays committed when cmd2 fails and retries)
			const cmdIds = doneEvents.map(e => e.payload.cmdId);
			expect(cmdIds).to.deep.equal([cmd1Id, cmd2Id, cmd3Id], 'events must be committed sequentially for cmd1, cmd2, cmd3');

			const emittedEventVersions = doneEvents.map(e => e.aggregateVersion);
			expect(emittedEventVersions).to.deep.equal([1, 2, 3], 'somethingDone events must have sequential versions');

			// 1st event comes from the 1st restored instance, 2nd+3rd from the re-created instance after retry
			const instanceIds = doneEvents.map(e => e.payload.instanceId);
			expect(instanceIds).to.deep.equal([1, 2, 2], 'cmd2 retry and cmd3 must execute against the same re-created instance');
			expect(nextInstanceId).to.equal(3, 'only 2 instances should be created for cmd1+cmd2/cmd3 (initial + retry)');
		});

		it('accepts retryOnConcurrencyError via constructor options with aggregateFactory', async () => {

			const aggregateId = 'factory-retry-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateFactory: params => new MyAggregate(params),
				handles: MyAggregate.handles,
				retryOnConcurrencyError: false
			});

			// Ensure aggregate exists
			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				assert.fail('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).to.be.instanceOf(ConcurrencyError);
				expect(dispatchCallCount).to.equal(1);
			}
		});

		it('accepts retryOnConcurrencyError config with ignoreAfterMaxRetries via constructor options with aggregateFactory', async () => {

			const aggregateId = 'factory-force-store-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateFactory: params => new MyAggregate(params),
				handles: MyAggregate.handles,
				retryOnConcurrencyError: {
					maxRetries: 0,
					ignoreAfterMaxRetries: true
				}
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy.restore();
			sinon.stub(eventStore, 'dispatch').callsFake(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).to.have.length(1);
			expect(dispatchCallCount).to.equal(2); // 1 regular attempt + ignored concurrency check
			expect(ignoredDispatchMeta).to.include({
				ignoreConcurrencyError: true
			});
		});
	});
});
