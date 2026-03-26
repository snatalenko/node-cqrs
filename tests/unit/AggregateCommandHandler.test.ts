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
		getNewIdSpy = jest.spyOn(eventStore, 'getNewId');
		getAggregateEventsSpy = jest.spyOn(eventStore, 'getAggregateEvents');
		commitSpy = jest.spyOn(eventStore, 'dispatch');

		commandBus = new CommandBus() as any;
		onSpy = jest.spyOn(commandBus, 'on');
	});

	it('exports a class', () => {
		expect(AggregateCommandHandler).toBeInstanceOf(Function);
		expect(AggregateCommandHandler.toString().substr(0, 5)).toBe('class');
	});

	it('subscribes to commands handled by Aggregate', () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		handler.subscribe(commandBus);

		expect(commandBus.on).toHaveBeenCalledTimes(2);

		{
			const args = onSpy.mock.calls[0];
			expect(args[0]).toBe('createAggregate');
			expect(args[1]).toBeInstanceOf(Function);
		}

		{
			const args = onSpy.mock.calls[1];
			expect(args[0]).toBe('doSomething');
			expect(args[1]).toBeInstanceOf(Function);
		}
	});

	it('throws when neither aggregateType nor aggregateFactory is provided', () => {
		expect(() => new AggregateCommandHandler({
			eventStore
		} as any)).toThrow('either aggregateType or aggregateFactory is required');
	});

	it('requests aggregate ID from event store, when aggregate does not exist', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'createAggregate' });

		expect(getNewIdSpy).toHaveBeenCalledTimes(1);
	});

	it('restores aggregate from event store events', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		expect(getAggregateEventsSpy).toHaveBeenCalledTimes(1);

		const args = getAggregateEventsSpy.mock.calls.at(-1) || [];
		expect(args[0]).toEqual(1);
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

		expect(getAggregateEventsSpy).toHaveBeenCalled();
		expect(getAggregateEventsSpy.mock.calls.at(-1)).toEqual([
			aggregateId,
			{ eventTypes: ['stateEvent'], tail: 'last' }
		]);

		expect(events[0]).toHaveProperty('aggregateVersion', 3);
	});

	it('passes commands to aggregate.handle(cmd)', async () => {

		const aggregate = new MyAggregate({ id: 1 });
		const handleSpy = jest.spyOn(aggregate, 'handle');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory: () => aggregate,
			handles: MyAggregate.handles
		});

		await handler.execute({ type: 'doSomething', payload: 'test' });

		const args = handleSpy.mock.calls.at(-1) || [];
		expect(args[0]).toHaveProperty('type', 'doSomething');
		expect(args[0]).toHaveProperty('payload', 'test');
	});

	it('creates a dedicated handle span for aggregate command processing', async () => {
		const spans: any[] = [];
		const tracer = {
			startSpan: jest.fn((name: string) => {
				const span = {
					name,
					end: jest.fn(),
					recordException: jest.fn(),
					setStatus: jest.fn()
				};
				spans.push(span);
				return span;
			})
		};
		const tracerFactory = () => tracer as any;
		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateType: MyAggregate,
			tracerFactory
		});

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		const handleSpan = spans.find(span => span.name === 'AggregateCommandHandler.execute doSomething');
		expect(handleSpan).toBeDefined();
		expect(commitSpy.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ otelSpan: handleSpan }));
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

		expect(events[0]).toHaveProperty('context', context);
		expect(events[0]).toHaveProperty('sagaOrigins');
		expect(events[0].sagaOrigins).toEqual(sagaOrigins);
	});

	it('resolves to produced events', async () => {
		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		const events = await handler.execute({ type: 'doSomething', aggregateId: 1 });

		expect(events).toHaveLength(1);
		expect(events[0]).toHaveProperty('type', 'somethingDone');
	});

	it('commits produced events to eventStore', async () => {

		const handler = new AggregateCommandHandler({ eventStore, aggregateType: MyAggregate });

		await handler.execute({ type: 'doSomething', aggregateId: 1 });

		expect(commitSpy).toHaveBeenCalledTimes(1);

		const args = commitSpy.mock.calls.at(-1) || [];
		expect(args[0]).toBeInstanceOf(Array);
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
		const makeSnapshotSpy = jest.spyOn(aggregate, 'makeSnapshot');

		const handler = new AggregateCommandHandler({
			eventStore,
			aggregateFactory: () => aggregate,
			handles: MyAggregate.handles
		});

		// test

		expect(makeSnapshotSpy).not.toHaveBeenCalled();
		expect(aggregate).toHaveProperty('version', 0);

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(makeSnapshotSpy).not.toHaveBeenCalled();
		expect(aggregate).toHaveProperty('version', 1); // 1st event

		await handler.execute({ type: 'doSomething', payload: 'test' });

		expect(makeSnapshotSpy).toHaveBeenCalledTimes(1);
		expect(aggregate).toHaveProperty('version', 3); // 2nd event and snapshot

		const [eventStream] = commitSpy.mock.calls.at(-1);

		expect(eventStream).toHaveLength(2);
		expect(eventStream[1]).toHaveProperty('type', 'snapshot');
		expect(eventStream[1]).toHaveProperty('aggregateVersion', 2);
		expect(eventStream[1]).toHaveProperty('payload');
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
		expect(emittedEventVersions).toEqual([0, 1, 2]);
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
		getAggregateEventsSpy.mockClear();
		factoryCallCount = 0;

		const command1 = { type: 'doSomething', aggregateId };
		const command2 = { type: 'doSomething', aggregateId };

		// Execute commands concurrently
		await Promise.all([
			handler.execute(command1),
			handler.execute(command2)
		]);

		// Check that restore and factory were called only once for the concurrent pair
		expect(getAggregateEventsSpy).toHaveBeenCalledTimes(1);
		expect(factoryCallCount).toBe(1, 'Aggregate factory should be called once for concurrent commands');


		getAggregateEventsSpy.mockClear();
		factoryCallCount = 0;

		// Execute a third command after the first two completed
		const command3 = { type: 'doSomething', aggregateId };
		await handler.execute(command3);

		// Check that restore and factory were called again for the subsequent command
		expect(getAggregateEventsSpy).toHaveBeenCalledTimes(1);
		expect(factoryCallCount).toBe(1, 'Aggregate factory should be called again for the subsequent command');
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
			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			commitSpy = jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?) => {
				dispatchCallCount++;
				if (dispatchCallCount === 1) // fail on first attempt
					throw new ConcurrencyError();

				return originalDispatch(events, meta);
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(events[0]).toHaveProperty('type', 'somethingDone');
			expect(dispatchCallCount).toBe(2); // failed once, succeeded on retry
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
			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockRejectedValue(new ConcurrencyError());

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
				expect(dispatchCallCount).toBe(1);
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);

				// retryOnConcurrencyError=2 means 2 retry attempts = 3 total dispatch calls
				expect(dispatchCallCount).toBe(3);
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
				expect(dispatchCallCount).toBe(3); // 2 retries + initial attempt
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
			})).toThrow(TypeError, 'retryOnConcurrencyError.maxRetries must be a non-negative integer');
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockRejectedValue(new ConcurrencyError('test conflict'));

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
				expect(retryDecisions).toHaveLength(2);
				expect(retryDecisions[0].attempt).toBe(0);
				expect(retryDecisions[1].attempt).toBe(1);
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

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(3); // 2 regular attempts + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
				ignoreConcurrencyError: true
			});
		});

		it('allows custom retry resolver to return "ignore" for a custom error type', async () => {

			class CustomDispatchError extends Error {}

			class IgnoreCustomErrorAggregate extends MyAggregate {
				static retryOnConcurrencyError = (err: unknown) =>
					(err instanceof CustomDispatchError ? 'ignore' : false);
			}

			const aggregateId = 'custom-error-ignore-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: IgnoreCustomErrorAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new CustomDispatchError('custom error');
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(2); // initial failure + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
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

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(2); // initial failure + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
				ignoreConcurrencyError: true
			});
		});

		it('throws errors produced by command handler even when retryOnConcurrencyError is set to "ignore"', async () => {

			class FailInCommandHandlerAggregate extends MyAggregate {
				static retryOnConcurrencyError = 'ignore' as const;

				override async doSomething() {
					await delay(5);
					throw new Error('command handler failed');
				}
			}

			const aggregateId = 'command-handler-error-ignore-test-id';

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: FailInCommandHandlerAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });
			commitSpy.mockClear();

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected error to be thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('command handler failed');
				expect(commitSpy).not.toHaveBeenCalled();
			}
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new Error('some other error');
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected error to be thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('some other error');
				expect(dispatchCallCount).toBe(1);
			}
		});

		it('does not retry non-ConcurrencyError errors with object retry config', async () => {

			class ConfigRetryAggregate extends MyAggregate {
				static retryOnConcurrencyError = {
					maxRetries: 2
				};
			}

			const aggregateId = 'non-concurrency-config-error-test-id';
			let dispatchCallCount = 0;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateType: ConfigRetryAggregate
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new Error('some other error');
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected error to be thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('some other error');
				expect(dispatchCallCount).toBe(1);
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

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(events[0]).toHaveProperty('type', 'somethingDone');
			expect(dispatchCallCount).toBe(3); // 2 regular attempts + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
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
			let dispatchCallCount = 0;
			let failedDispatchCmdId: string | undefined;
			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?) => {
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
			expect(dispatchCallCount).toBe(4);
			expect(failedDispatchCmdId).toBe(cmd2Id, 'the failed dispatch must correspond to the 2nd command');

			// Collect committed somethingDone events
			const allEvents = [];
			for await (const event of eventStore.getAggregateEvents(aggregateId))
				allEvents.push(event);
			const doneEvents = allEvents.filter(e => e.type === 'somethingDone');
			expect(doneEvents).toHaveLength(3);

			// Verify events produced before failure were committed (cmd1 stays committed when cmd2 fails and retries)
			const cmdIds = doneEvents.map(e => e.payload.cmdId);
			expect(cmdIds).toEqual([cmd1Id, cmd2Id, cmd3Id], 'events must be committed sequentially for cmd1, cmd2, cmd3');

			const emittedEventVersions = doneEvents.map(e => e.aggregateVersion);
			expect(emittedEventVersions).toEqual([1, 2, 3], 'somethingDone events must have sequential versions');

			// 1st event comes from the 1st restored instance, 2nd+3rd from the re-created instance after retry
			const instanceIds = doneEvents.map(e => e.payload.instanceId);
			expect(instanceIds).toEqual([1, 2, 2], 'cmd2 retry and cmd3 must execute against the same re-created instance');
			expect(nextInstanceId).toBe(3, 'only 2 instances should be created for cmd1+cmd2/cmd3 (initial + retry)');
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

			commitSpy.mockRestore();
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async () => {
				dispatchCallCount++;
				throw new ConcurrencyError();
			});

			try {
				await handler.execute({ type: 'doSomething', aggregateId });
				throw new Error('Expected ConcurrencyError to be thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
				expect(dispatchCallCount).toBe(1);
			}
		});

		it('accepts retryOnConcurrencyError set to "ignore" via constructor options with aggregateFactory', async () => {

			const aggregateId = 'factory-ignore-test-id';
			let dispatchCallCount = 0;
			let ignoredDispatchMeta: Record<string, any> | undefined;

			const handler = new AggregateCommandHandler({
				eventStore,
				aggregateFactory: params => new MyAggregate(params),
				handles: MyAggregate.handles,
				retryOnConcurrencyError: 'ignore'
			});

			await handler.execute({ type: 'createAggregate', aggregateId });

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(2); // initial failure + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
				ignoreConcurrencyError: true
			});
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

			commitSpy.mockRestore();
			const originalDispatch = eventStore.dispatch.bind(eventStore);
			jest.spyOn(eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError) {
					ignoredDispatchMeta = meta;
					return originalDispatch(events, meta);
				}

				throw new ConcurrencyError();
			});

			const events = await handler.execute({ type: 'doSomething', aggregateId });

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(2); // 1 regular attempt + ignored concurrency check
			expect(ignoredDispatchMeta).toMatchObject({
				ignoreConcurrencyError: true
			});
		});
	});
});
