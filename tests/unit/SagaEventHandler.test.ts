import {
	SagaEventHandler,
	InMemoryEventStorage,
	EventStore,
	AbstractSaga,
	InMemoryMessageBus,
	EventDispatcher
} from '../../src';
import { Deferred } from '../../src/utils';

class Saga extends AbstractSaga {
	static get startsWith() {
		return ['somethingHappened'];
	}
	static get handles(): string[] {
		return ['followingHappened'];
	}
	somethingHappened(_event) {
		super.enqueue('doSomething', undefined, { foo: 'bar' });
	}
	followingHappened() {
		super.enqueue('complete', undefined, { foo: 'bar' });
	}
}

const triggeringEvent = {
	id: 'starter-1',
	type: 'somethingHappened',
	aggregateId: 1
};

describe('SagaEventHandler', function () {

	let commandBus: InMemoryMessageBus;
	let eventStore: EventStore;
	let sagaEventHandler: SagaEventHandler;
	let eventStorage: InMemoryEventStorage;

	beforeEach(() => {
		const eventBus = new InMemoryMessageBus();
		const eventDispatcher = new EventDispatcher({ eventBus });
		eventStorage = new InMemoryEventStorage();
		commandBus = new InMemoryMessageBus({});
		eventStore = new EventStore({
			eventStorageReader: eventStorage,
			identifierProvider: eventStorage,
			eventBus,
			eventDispatcher
		});
		const logger: any = {
			child: () => ({
				debug: () => undefined,
				info: () => undefined
			})
		};
		sagaEventHandler = new SagaEventHandler({ sagaType: Saga, eventStore, commandBus, logger });
	});

	it('exists', () => {
		expect(SagaEventHandler).toBeInstanceOf(Function);
	});

	it('restores saga state, passes in received event and sends emitted commands', async () => {

		const deferred = new Deferred();

		commandBus.on('complete', () => {
			deferred.resolve(undefined);
		});

		jest.spyOn(eventStore, 'getSagaEvents');
		await eventStorage.commitEvents([
			{ id: 'starter-1', type: 'somethingHappened', aggregateId: 1, sagaOrigins: { Saga: 'starter-1' } },
			{ id: 'e-following-1', type: 'followingHappened', aggregateId: 1, sagaOrigins: { Saga: 'starter-1' } }
		] as any);

		expect(eventStore.getSagaEvents).toHaveBeenCalledTimes(0);

		await sagaEventHandler.handle({
			id: 'e-following-1',
			type: 'followingHappened',
			aggregateId: 1,
			sagaOrigins: {
				Saga: 'starter-1'
			},
			payload: undefined
		});

		expect(eventStore.getSagaEvents).toHaveBeenCalledTimes(1);

		await deferred.promise;
	});

	it('propagates command execution errors', async () => {

		commandBus.on('doSomething', _command => {
			throw new Error('command execution failed');
		});

		let thrown: any;
		try {
			await sagaEventHandler.handle(triggeringEvent as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).toHaveProperty('message', 'command execution failed');
	});

	it('throws for starter events without event id', async () => {
		let thrown: any;

		try {
			await sagaEventHandler.handle({
				type: 'somethingHappened',
				aggregateId: 1
			} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(TypeError);
		expect(thrown).toHaveProperty('message', 'event.id must be a non-empty String');
	});

	it('does not mutate starter event when saga origin is absent', async () => {
		const event = {
			id: 'starter-2',
			type: 'somethingHappened',
			aggregateId: 1
		};
		const deferred = new Deferred<any>();
		commandBus.on('doSomething', command => deferred.resolve(command));

		await sagaEventHandler.handle(event as any);

		const command = await deferred.promise;
		expect(event).not.toHaveProperty('sagaOrigins');
		expect(command).toHaveProperty('sagaOrigins.Saga', 'starter-2');
	});

	it('throws when starter event already has saga origin with same event id', async () => {
		let thrown: any;

		try {
			await sagaEventHandler.handle({
				id: 'starter-3',
				type: 'somethingHappened',
				aggregateId: 1,
				sagaOrigins: {
					Saga: 'starter-3'
				}
			} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).toHaveProperty('message', 'Starter event "somethingHappened" already contains saga origin for "Saga"');
	});

	it('throws when starter event already has saga origin with another event id', async () => {
		let thrown: any;

		try {
			await sagaEventHandler.handle({
				id: 'starter-4',
				type: 'somethingHappened',
				aggregateId: 1,
				sagaOrigins: {
					Saga: 'starter-other'
				}
			} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).toHaveProperty('message', 'Starter event "somethingHappened" already contains saga origin for "Saga"');
	});

	it('propagates event context to commands when command.context is not set', async () => {
		const deferred = new Deferred<any>();

		commandBus.on('doSomething', command => deferred.resolve(command));

		await sagaEventHandler.handle({
			id: 'starter-ctx-1',
			type: 'somethingHappened',
			aggregateId: 1,
			context: { requestId: 'r1' }
		} as any);

		const command = await deferred.promise;
		expect(command).toHaveProperty('context');
		expect(command.context).toEqual({ requestId: 'r1' });
	});

	it('supports sagaFactory wiring and requires sagaDescriptor', async () => {
		let thrown: any;
		try {
			// eslint-disable-next-line no-new
			new SagaEventHandler({
				sagaFactory: () => ({ mutate: () => undefined, handle: () => [] } as any),
				eventStore,
				commandBus,
				startsWith: ['somethingHappened'],
				handles: []
			} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(TypeError);
		expect(thrown).toHaveProperty('message', 'options.sagaDescriptor must be a non-empty String');

		const factoryHandler = new SagaEventHandler({
			sagaFactory: () => ({ mutate: () => undefined, handle: () => [] } as any),
			eventStore,
			commandBus,
			startsWith: ['somethingHappened'],
			handles: [],
			sagaDescriptor: 'MySaga'
		} as any);

		await factoryHandler.handle({ id: 'starter-factory-1', type: 'somethingHappened', aggregateId: 1 } as any);
	});

	it('throws when neither sagaType nor sagaFactory is provided', () => {
		expect(() => new SagaEventHandler({
			eventStore,
			commandBus
		} as any)).toThrow('Either sagaType or sagaFactory is required');
	});

	it('throws when a non-starter event has no saga origin', async () => {
		let thrown: any;

		try {
			await sagaEventHandler.handle({
				id: 'no-origin-1',
				type: 'followingHappened',
				aggregateId: 1
			} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).toHaveProperty('message', 'Event "followingHappened" does not contain saga origin for "Saga"');
	});

	it('starts saga for handled events when startsWith is not defined and saga origin is absent', async () => {
		class OriginDrivenSaga extends AbstractSaga {
			somethingHappened(_event: any) {
				super.enqueue('doOriginDriven');
			}
		}

		const handler = new SagaEventHandler({ sagaType: OriginDrivenSaga, eventStore, commandBus });

		const deferred = new Deferred<any>();
		commandBus.on('doOriginDriven', command => deferred.resolve(command));

		await handler.handle({ id: 'od-1', type: 'somethingHappened', aggregateId: 1 } as any);

		const cmd = await deferred.promise;
		expect(cmd).toHaveProperty('sagaOrigins.OriginDrivenSaga', 'od-1');
	});

	it('restores saga for handled events when startsWith is not defined and saga origin is present', async () => {
		class OriginDrivenSaga extends AbstractSaga {
			static get handles(): string[] {
				return ['somethingHappened', 'followingHappened'];
			}
			somethingHappened() { }
			followingHappened() {
				super.enqueue('completeOriginDriven');
			}
		}

		const handler = new SagaEventHandler({ sagaType: OriginDrivenSaga, eventStore, commandBus });
		jest.spyOn(eventStore, 'getSagaEvents');

		const origin = 'od-origin-1';
		await eventStorage.commitEvents([
			{ id: origin, type: 'somethingHappened', aggregateId: 1, sagaOrigins: { OriginDrivenSaga: origin } },
			{ id: 'od-follow-1', type: 'followingHappened', aggregateId: 1, sagaOrigins: { OriginDrivenSaga: origin } }
		] as any);

		const deferred = new Deferred<void>();
		commandBus.on('completeOriginDriven', () => deferred.resolve(undefined));

		await handler.handle({
			id: 'od-follow-1',
			type: 'followingHappened',
			aggregateId: 1,
			sagaOrigins: { OriginDrivenSaga: origin },
			payload: undefined
		} as any);

		expect(eventStore.getSagaEvents).toHaveBeenCalledTimes(1);
		await deferred.promise;
	});

	it('awaits async mutate() when restoring saga state', async () => {
		const allowMutateFinish = new Deferred<void>();
		let handleCalled = false;

		const handler = new SagaEventHandler({
			sagaFactory: () => ({
				async mutate(_event: any) {
					await allowMutateFinish.promise;
				},
				async handle(_event: any) {
					handleCalled = true;
					return [];
				}
			} as any),
			eventStore,
			commandBus,
			startsWith: ['somethingHappened'],
			handles: ['followingHappened'],
			sagaDescriptor: 'AsyncRestoreSaga'
		} as any);

		const sagaOrigin = 'starter-async-1';
		await eventStorage.commitEvents([
			{ id: sagaOrigin, type: 'somethingHappened', aggregateId: 1, sagaOrigins: { AsyncRestoreSaga: sagaOrigin } },
			{ id: 'evt-old-1', type: 'followingHappened', aggregateId: 1, sagaOrigins: { AsyncRestoreSaga: sagaOrigin } },
			{ id: 'evt-current-1', type: 'followingHappened', aggregateId: 1, sagaOrigins: { AsyncRestoreSaga: sagaOrigin } }
		] as any);

		const p = handler.handle({
			id: 'evt-current-1',
			type: 'followingHappened',
			aggregateId: 1,
			sagaOrigins: { AsyncRestoreSaga: sagaOrigin }
		} as any);

		await new Promise(setImmediate);
		expect(handleCalled).toBe(false);

		allowMutateFinish.resolve(undefined);
		await p;

		expect(handleCalled).toBe(true);
	});

	it('executes concurrent events for the same saga id sequentially on the same saga instance', async () => {

		const instances = new Set<any>();
		let inFlight = 0;
		let maxInFlight = 0;
		let callCount = 0;
		const firstEntered = new Deferred<void>();
		const allowFirstFinish = new Deferred<void>();

		class ConcurrencySaga extends AbstractSaga {
			static get startsWith() {
				return ['somethingHappened'];
			}
			static get handles(): string[] {
				return ['followingHappened'];
			}
			somethingHappened() { }
			async followingHappened(_event) {
				instances.add(this);

				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);

				callCount += 1;
				if (callCount === 1) {
					firstEntered.resolve(undefined);
					await allowFirstFinish.promise;
				}

				await new Promise(setImmediate);

				inFlight -= 1;
			}
		}

		const concurrentHandler = new SagaEventHandler({ sagaType: ConcurrencySaga, eventStore, commandBus });

		jest.spyOn(eventStore, 'getSagaEvents');

		const sagaId = 's1';

		await eventStorage.commitEvents([
			{ id: 's1', type: 'somethingHappened', aggregateId: 1, sagaOrigins: { ConcurrencySaga: sagaId } },
			{ id: 'evt-1', type: 'followingHappened', aggregateId: 1, sagaOrigins: { ConcurrencySaga: sagaId } },
			{ id: 'evt-2', type: 'followingHappened', aggregateId: 1, sagaOrigins: { ConcurrencySaga: sagaId } }
		] as any);

		const e1 = {
			id: 'evt-1',
			type: 'followingHappened',
			aggregateId: 1,
			sagaOrigins: {
				ConcurrencySaga: sagaId
			}
		};
		const e2 = {
			id: 'evt-2',
			type: 'followingHappened',
			aggregateId: 1,
			sagaOrigins: {
				ConcurrencySaga: sagaId
			}
		};

		const p1 = concurrentHandler.handle(e1 as any);
		await firstEntered.promise;

		const p2 = concurrentHandler.handle(e2 as any);

		allowFirstFinish.resolve(undefined);

		await Promise.all([p1, p2]);

		expect(maxInFlight).toBe(1);
		expect(instances.size).toBe(1);
		expect(eventStore.getSagaEvents).toHaveBeenCalledTimes(1);
	});

	it('supports a starter event that starts multiple sagas', async () => {

		class SagaA extends AbstractSaga {
			static get startsWith() {
				return ['somethingHappened'];
			}
			somethingHappened() {
				super.enqueue('doA', undefined, { ok: true });
			}
		}

		class SagaB extends AbstractSaga {
			static get startsWith() {
				return ['somethingHappened'];
			}
			somethingHappened() {
				super.enqueue('doB', undefined, { ok: true });
			}
		}

		const handlerA = new SagaEventHandler({ sagaType: SagaA, eventStore, commandBus });
		const handlerB = new SagaEventHandler({ sagaType: SagaB, eventStore, commandBus });

		const a = new Deferred<any>();
		const b = new Deferred<any>();
		commandBus.on('doA', command => a.resolve(command));
		commandBus.on('doB', command => b.resolve(command));

		const event = {
			id: 'origin-1',
			type: 'somethingHappened',
			aggregateId: 1
		};

		await handlerA.handle(event as any);
		await handlerB.handle(event as any);

		const cmdA = await a.promise;
		const cmdB = await b.promise;

		expect(cmdA).toHaveProperty('sagaOrigins.SagaA', 'origin-1');
		expect(cmdB).toHaveProperty('sagaOrigins.SagaB', 'origin-1');
		expect(cmdA.sagaOrigins).not.toHaveProperty('SagaB');
		expect(cmdB.sagaOrigins).not.toHaveProperty('SagaA');
	});
});
