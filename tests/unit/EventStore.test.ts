import {
	type IEventDispatcher,
	EventDispatcher,
	InMemoryMessageBus,
	EventStore
} from '../../src';
import type {
	IEvent,
	IEventBus,
	IEventStorageReader,
	IAggregateSnapshotStorage,
	IIdentifierProvider
} from '../../src/interfaces';

describe('EventStore', () => {

	let store: EventStore;
	let eventBus: IEventBus;
	let eventDispatcher: IEventDispatcher;
	let mockStorage: jest.Mocked<IEventStorageReader>;
	let mockSnapshotStorage: jest.Mocked<IAggregateSnapshotStorage>;
	let mockIdentifierProvider: jest.Mocked<IIdentifierProvider>;
	const mockId = 'test-id';

	beforeEach(() => {
		eventBus = new InMemoryMessageBus();
		eventDispatcher = new EventDispatcher({ eventBus });

		mockStorage = {
			getAggregateEvents: jest.fn().mockResolvedValue([]),
			getSagaEvents: jest.fn().mockResolvedValue([]),
			getEventsByTypes: jest.fn().mockResolvedValue([])
		} as any;

		mockSnapshotStorage = {
			getAggregateSnapshot: jest.fn().mockResolvedValue(undefined)
		} as any;

		mockIdentifierProvider = {
			getNewId: jest.fn().mockResolvedValue(mockId)
		} as any;

		store = new EventStore({
			eventBus,
			eventDispatcher,
			eventStorageReader: mockStorage,
			identifierProvider: mockIdentifierProvider,
			snapshotStorage: mockSnapshotStorage,
			logger: undefined
		});
	});

	describe('constructor', () => {

		it('uses eventStorage as fallback when eventStorageReader is not provided', async () => {
			const storage = {
				getAggregateEvents: jest.fn().mockResolvedValue([]),
				getSagaEvents: jest.fn().mockResolvedValue([]),
				getEventsByTypes: jest.fn().mockResolvedValue([]),
				getNewId: jest.fn().mockResolvedValue('storage-id')
			} as unknown as IEventStorageReader & IIdentifierProvider;

			const storeWithFallback = new EventStore({
				eventBus,
				eventDispatcher,
				eventStorage: storage,
				logger: undefined
			});

			await expect(storeWithFallback.getNewId()).resolves.toBe('storage-id');
			expect(storage.getNewId).toHaveBeenCalledTimes(1);

			for await (const _ of storeWithFallback.getEventsByTypes(['test']))
				void _;
			expect(storage.getEventsByTypes).toHaveBeenCalledWith(['test'], undefined);
		});

		it('prefers eventStorageReader when both eventStorageReader and eventStorage are provided', async () => {
			const reader = {
				getAggregateEvents: jest.fn().mockResolvedValue([]),
				getSagaEvents: jest.fn().mockResolvedValue([]),
				getEventsByTypes: jest.fn().mockResolvedValue([]),
				getNewId: jest.fn().mockResolvedValue('reader-id')
			} as unknown as IEventStorageReader & IIdentifierProvider;
			const storage = {
				getAggregateEvents: jest.fn().mockResolvedValue([]),
				getSagaEvents: jest.fn().mockResolvedValue([]),
				getEventsByTypes: jest.fn().mockResolvedValue([]),
				getNewId: jest.fn().mockResolvedValue('storage-id')
			} as unknown as IEventStorageReader & IIdentifierProvider;

			const storeWithBoth = new EventStore({
				eventBus,
				eventDispatcher,
				eventStorageReader: reader,
				eventStorage: storage,
				logger: undefined
			});

			await expect(storeWithBoth.getNewId()).resolves.toBe('reader-id');
			expect(reader.getNewId).toHaveBeenCalledTimes(1);
			expect(storage.getNewId).not.toHaveBeenCalled();
		});

		it('throws when neither eventStorageReader nor eventStorage is provided', () => {
			expect(() => new EventStore({
				eventBus,
				eventDispatcher,
				identifierProvider: mockIdentifierProvider,
				logger: undefined
			} as any)).toThrow('eventStorageReader or eventStorage is required');
		});
	});

	describe('dispatch', () => {

		it('throws error when called with non-array argument', async () => {

			await expect(store.dispatch(null as any)).rejects.toThrow(TypeError);
		});

		it('forwards events unchanged to dispatcher', async () => {
			const event: IEvent<void> = Object.freeze({
				id: 'event-1',
				type: 'StartSaga',
				sagaOrigins: { SagaA: 'event-1' },
				payload: undefined
			});
			const dispatchSpy = jest.spyOn(eventDispatcher, 'dispatch');

			const [processed] = await store.dispatch([event]);

			expect(processed).toBe(event);
			expect(dispatchSpy).toHaveBeenCalledWith([event], expect.objectContaining({ origin: 'internal' }));
		});

		it('merges custom dispatch metadata with internal origin', async () => {
			const event: IEvent<void> = Object.freeze({
				id: 'event-1',
				type: 'StartSaga',
				payload: undefined
			});
			const dispatchSpy = jest.spyOn(eventDispatcher, 'dispatch');

			await store.dispatch([event], { ignoreConcurrencyError: true });

			expect(dispatchSpy).toHaveBeenCalledWith([event], expect.objectContaining({
				ignoreConcurrencyError: true,
				origin: 'internal'
			}));
		});

		it('does not assign id to events when missing', async () => {
			const event: IEvent = { type: 'RegularEvent' } as IEvent;
			const [processed] = await store.dispatch([event]);

			expect(processed.id).toBeUndefined();
			expect(event.id).toBeUndefined();
		});

		it('does not modify sagaOrigins when dispatching', async () => {
			const event: IEvent = {
				id: 'event-2',
				type: 'RegularEvent',
				sagaOrigins: { SagaA: 'starter-1' },
				payload: undefined
			} as IEvent;

			const [processed] = await store.dispatch([event]);

			expect(processed.sagaOrigins).toEqual({ SagaA: 'starter-1' });
		});
	});

	describe('getAggregateEvents', () => {

		it('retrieves aggregate events including snapshot if available', async () => {
			const snapshotEvent = { type: 'SnapshotEvent' } as IEvent;
			const storedEvents = [{ type: 'Event1' }, { type: 'Event2' }] as IEvent[];
			mockSnapshotStorage.getAggregateSnapshot.mockResolvedValueOnce(snapshotEvent);
			mockStorage.getAggregateEvents.mockResolvedValueOnce(storedEvents);

			const result: IEvent[] = [];
			for await (const event of store.getAggregateEvents('aggregate-1'))
				result.push(event);


			expect(result).toEqual([snapshotEvent, ...storedEvents]);
			expect(mockSnapshotStorage.getAggregateSnapshot).toHaveBeenCalledWith('aggregate-1');
			expect(mockStorage.getAggregateEvents).toHaveBeenCalledWith('aggregate-1', { snapshot: snapshotEvent });
		});
	});

	describe('getSagaEvents', () => {

		it('retrieves saga events with provided filter', async () => {
			const sagaEvents = [{ type: 'SagaEvent1' }] as IEvent[];
			mockStorage.getSagaEvents.mockResolvedValueOnce(sagaEvents);
			const filter = { beforeEvent: { id: 'before-1', sagaOrigins: { SagaA: 'origin-1' } } };

			const result: IEvent[] = [];
			for await (const event of store.getSagaEvents('SagaA:origin-1', filter as any))
				result.push(event);


			expect(result).toEqual(sagaEvents);
			expect(mockStorage.getSagaEvents).toHaveBeenCalledWith('SagaA:origin-1', filter);
		});

		it('throws when filter.beforeEvent.sagaOrigins does not match sagaId', async () => {
			const filter = { beforeEvent: { id: 'before-1', sagaOrigins: { SagaA: 'other-origin' } } };

			await expect(async () => {
				for await (const _ of store.getSagaEvents('SagaA:origin-1', filter as any))
					void _;
			}).rejects.toThrow('filter.beforeEvent.sagaOrigins does not match sagaId');
		});
	});

	describe('getNewId', () => {

		it('delegates to the identifierProvider', async () => {
			const id = await store.getNewId();
			expect(id).toBe(mockId);
			expect(mockIdentifierProvider.getNewId).toHaveBeenCalled();
		});
	});

	describe('on/off/queue', () => {

		it('delegates on, off, and queue calls to eventBus', () => {
			const handler = jest.fn();
			const onSpy = jest.spyOn(eventBus, 'on');
			const offSpy = jest.spyOn(eventBus, 'off');
			const queueSpy = jest.spyOn(eventBus, 'queue');

			store.on('testEvent', handler);
			expect(onSpy).toHaveBeenCalledWith('testEvent', handler);

			store.off('testEvent', handler);
			expect(offSpy).toHaveBeenCalledWith('testEvent', handler);

			const queueResult = store.queue('testQueue');
			expect(queueResult).toBeInstanceOf(InMemoryMessageBus);
			expect(queueSpy).toHaveBeenCalledWith('testQueue');
		});

		it('throws when injected eventBus does not support queue()', () => {
			(store as any).eventBus = {
				publish: jest.fn(),
				on: jest.fn(),
				off: jest.fn()
			};

			expect(() => store.queue('testQueue'))
				.toThrow('Injected eventBus does not support named queues');
		});
	});

	describe('drain()', () => {

		it('delegates to eventDispatcher.drain()', async () => {
			const drainResult = Promise.resolve([]);
			jest.spyOn(eventDispatcher, 'drain').mockReturnValue(drainResult);

			const result = store.drain();

			expect(result).toBe(drainResult);
			expect(eventDispatcher.drain).toHaveBeenCalledTimes(1);
		});

		it('resolves after all in-flight publishes settle', async () => {
			const event: IEvent = { type: 'slow-event' };

			let resolvePublish!: () => void;
			const publishPromise = new Promise<void>(res => {
				resolvePublish = res;
			});
			const localBus = new InMemoryMessageBus();
			jest.spyOn(localBus, 'publish').mockReturnValue(publishPromise as any);
			const localDispatcher = new EventDispatcher({ eventBus: localBus });
			const localStore = new EventStore({
				eventBus: localBus,
				eventDispatcher: localDispatcher,
				eventStorageReader: mockStorage,
				identifierProvider: mockIdentifierProvider,
				logger: undefined
			});

			await localStore.dispatch([event]);

			let drainResolved = false;
			const drainPromise = localStore.drain().then(() => {
				drainResolved = true;
			});

			await Promise.resolve();
			expect(drainResolved).toBe(false);

			resolvePublish();
			await drainPromise;
			expect(drainResolved).toBe(true);
		});
	});

	describe('once', () => {

		it('sets up a one-time subscription and resolves with an event', async () => {
			let callCount = 0;
			const testEvent = { type: 'onceEvent' } as IEvent;
			const promise = store.once('onceEvent', (_e: IEvent) => {
				callCount++;
			});

			await store.dispatch([testEvent]);

			await expect(promise).resolves.toMatchObject(testEvent);
			expect(callCount).toBe(1);
		});

		it('works only once', async () => {
			let callCount = 0;
			const testEvent = { type: 'onceEvent' } as IEvent;
			const testEvent2 = { type: 'onceEvent' } as IEvent;
			const promise = store.once('onceEvent', (_e: IEvent) => {
				callCount++;
			});

			await store.dispatch([testEvent, testEvent2]);
			await store.dispatch([testEvent2]);

			await expect(promise).resolves.toMatchObject(testEvent);
			expect(callCount).toBe(1);
		});
	});
});
