import { InMemoryEventStorage, ConcurrencyError } from '../../../src';

describe('InMemoryEventStorage', () => {
	let storage;

	beforeEach(() => {
		storage = new InMemoryEventStorage();
	});

	describe('commitEvents', () => {
		it('commits events and returns them', async () => {
			const events = [
				{ id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' }
			];
			const result = await storage.commitEvents(events);
			expect(result).toEqual(events);
		});

		it('throws ConcurrencyError when committing a duplicate aggregateVersion for the same aggregate', async () => {
			await storage.commitEvents([
				{ id: '1', aggregateId: 'agg1', aggregateVersion: 0, type: 'Created' }
			]);

			try {
				await storage.commitEvents([
					{ id: '2', aggregateId: 'agg1', aggregateVersion: 0, type: 'Created' }
				]);
				throw new Error('Expected ConcurrencyError was not thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
			}
		});

		it('allows duplicate aggregateVersion when ignoreConcurrencyError option is enabled', async () => {
			await storage.commitEvents([
				{ id: '1', aggregateId: 'agg1', aggregateVersion: 0, type: 'Created' }
			]);

			const duplicate = [
				{ id: '2', aggregateId: 'agg1', aggregateVersion: 0, type: 'Created' }
			];

			const result = await storage.commitEvents(duplicate, { ignoreConcurrencyError: true });

			expect(result).toEqual(duplicate);
		});
	});

	describe('getAggregateEvents', () => {

		it('yields events with matching aggregateId', async () => {

			const event1 = { id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: '2', aggregateId: 'agg2', aggregateVersion: 1, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('agg1'))
				results.push(event);

			expect(results).toEqual([event1]);
		});

		it('yields events with aggregateVersion greater than snapshot.aggregateVersion', async () => {

			const event1 = { id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: '2', aggregateId: 'agg1', aggregateVersion: 2, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const snapshot = { aggregateVersion: 1 };
			const results = [];
			for await (const event of storage.getAggregateEvents('agg1', { snapshot }))
				results.push(event);

			expect(results).toEqual([event2]);
		});
	});

	describe('getSagaEvents', () => {

		it('yields saga events from origin up to beforeEvent', async () => {

			const event1 = { id: '1', sagaOrigins: { SagaA: '1' }, type: 'SagaStarted' };
			const event2 = { id: '2', sagaOrigins: { SagaA: '1' }, type: 'SagaProgressed' };
			const event3 = { id: '3', sagaOrigins: { SagaA: '1' }, type: 'SagaProgressed' };
			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { id: '3', sagaOrigins: { SagaA: '1' } };
			const results = [];
			for await (const event of storage.getSagaEvents('SagaA:1', { beforeEvent } as any))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('supports events participating in multiple sagas', async () => {

			const event1 = {
				id: '1',
				sagaOrigins: {
					SagaA: '1',
					SagaB: '1'
				},
				type: 'SagaEvent'
			};
			const event2 = { id: '2', sagaOrigins: { SagaB: '1' }, type: 'SagaEvent' };
			const event3 = { id: '3', sagaOrigins: { SagaB: '1' }, type: 'SagaEvent' };

			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { id: '3', sagaOrigins: { SagaB: '1' } };
			const results = [];
			for await (const event of storage.getSagaEvents('SagaB:1', { beforeEvent } as any))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('throws when beforeEvent.sagaOrigins does not match sagaId', async () => {
			const event1 = { id: '1', sagaOrigins: { SagaA: '1' }, type: 'SagaStarted' };
			await storage.commitEvents([event1]);

			const beforeEvent = { id: '1', sagaOrigins: { SagaA: '2' } };
			const stream = storage.getSagaEvents('SagaA:1', { beforeEvent } as any);

			try {
				await stream.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err).toBeInstanceOf(TypeError);
				expect(err.message).toBe('beforeEvent.sagaOrigins does not match sagaId');
			}
		});

		it('throws when origin event cannot be found', async () => {
			await storage.commitEvents([{ id: 'before', sagaOrigins: { SagaA: 'origin' }, type: 'SagaProgressed' }]);

			const beforeEvent = { id: 'before', sagaOrigins: { SagaA: 'origin' } };
			const stream = storage.getSagaEvents('SagaA:origin', { beforeEvent } as any);

			try {
				await stream.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('origin event origin not found');
			}
		});

		it('throws when beforeEvent cannot be found in storage', async () => {
			await storage.commitEvents([{ id: 'origin', sagaOrigins: { SagaA: 'origin' }, type: 'SagaStarted' }]);

			const beforeEvent = { id: 'missing', sagaOrigins: { SagaA: 'origin' } };
			const stream = storage.getSagaEvents('SagaA:origin', { beforeEvent } as any);

			try {
				await stream.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('beforeEvent missing not found');
			}
		});
	});

	describe('getEventsByTypes', () => {

		it('yields events matching the provided types', async () => {

			const event1 = { id: '1', type: 'A' };
			const event2 = { id: '2', type: 'B' };
			const event3 = { id: '3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A']))
				results.push(event);

			expect(results).toEqual([event1, event3]);
		});

		it('yields events only after the given afterEvent id', async () => {

			const event1 = { id: '1', type: 'A' };
			const event2 = { id: '2', type: 'A' };
			const event3 = { id: '3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const options = { afterEvent: { id: '1' } };
			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], options))
				results.push(event);

			expect(results).toEqual([event2, event3]);
		});

		it('throws error if afterEvent is provided without id', async () => {

			const event1 = { id: '1', type: 'A' };
			await storage.commitEvents([event1]);
			const options = { afterEvent: {} };

			const gen = storage.getEventsByTypes(['A'], options);
			try {
				await gen.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(TypeError);
				expect(err.message).toBe('options.afterEvent.id must be a non-empty String');
			}
		});
	});

	describe('getNewId', () => {

		it('returns sequential string ids', () => {

			const id1 = storage.getNewId();
			const id2 = storage.getNewId();
			expect(id1).toBe('1');
			expect(id2).toBe('2');
		});
	});

	describe('process', () => {

		it('throws when batch item does not contain event', async () => {
			try {
				await storage.process([{}] as any);
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('Event batch does not contain `event`');
			}
		});

		it('creates a span for process when tracerFactory is provided', async () => {
			const spans: string[] = [];
			const tracer = {
				startSpan: jest.fn((name: string) => {
					spans.push(name);
					return {
						end: jest.fn(),
						recordException: jest.fn(),
						setStatus: jest.fn()
					};
				})
			};
			const tracedStorage = new InMemoryEventStorage({
				tracerFactory: () => tracer as any
			} as any);

			await tracedStorage.process([
				{ event: { id: '1', aggregateId: 'agg-1', aggregateVersion: 0, type: 'Created' } }
			] as any);

			expect(spans).toContain('InMemoryEventStorage.process');
			expect(spans).not.toContain('commitEvents');
		});

	});
});
