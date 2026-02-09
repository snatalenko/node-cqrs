import { EventDispatcher } from '../../dist/cjs/EventDispatcher';
import { IEventDispatcher, InMemoryMessageBus } from '../../src';
import { EventStore } from '../../src/EventStore';
import {
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
			expect(dispatchSpy).toHaveBeenCalledWith([event], { origin: 'internal' });
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
