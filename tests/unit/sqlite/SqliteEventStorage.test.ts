import createDb from 'better-sqlite3';
import { SqliteEventStorage } from '../../../src/sqlite';
import { ConcurrencyError } from '../../../src';

describe('SqliteEventStorage', () => {
	let db: import('better-sqlite3').Database;
	let storage: SqliteEventStorage;

	beforeEach(async () => {
		db = createDb(':memory:');
		storage = new SqliteEventStorage({ viewModelSqliteDb: db });
		await storage.assertConnection();
	});

	afterEach(() => {
		db.close();
	});

	describe('commitEvents', () => {
		it('commits events and returns them', async () => {
			const events = [
				{ id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1, type: 'TestEvent' }
			];
			const result = await storage.commitEvents(events);
			expect(result).toEqual(events);
		});

		it('throws ConcurrencyError when committing a duplicate aggregateVersion for the same aggregate', async () => {
			await storage.commitEvents([
				{ id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 0, type: 'Created' }
			]);

			try {
				await storage.commitEvents([
					{ id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 0, type: 'Created' }
				]);
				throw new Error('Expected ConcurrencyError was not thrown');
			}
			catch (err) {
				expect(err).toBeInstanceOf(ConcurrencyError);
			}
		});

		it('allows duplicate aggregateVersion when ignoreConcurrencyError option is enabled', async () => {
			await storage.commitEvents([
				{ id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 0, type: 'Created' }
			]);

			const duplicate = [
				{ id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 0, type: 'Created' }
			];

			const result = await storage.commitEvents(duplicate, { ignoreConcurrencyError: true });

			expect(result).toEqual(duplicate);
		});
	});

	describe('getAggregateEvents', () => {

		it('yields events with matching aggregateId', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000020', aggregateVersion: 1, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('a0000000000000000000000000000010'))
				results.push(event);

			expect(results).toEqual([event1]);
		});

		it('yields events with aggregateVersion greater than snapshot.aggregateVersion', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 2, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const snapshot = { aggregateVersion: 1 };
			const results = [];
			for await (const event of storage.getAggregateEvents('a0000000000000000000000000000010', { snapshot } as any))
				results.push(event);

			expect(results).toEqual([event2]);
		});

		it('filters by eventTypes when provided', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1, type: 'TypeA' };
			const event2 = { id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 2, type: 'TypeB' };
			const event3 = { id: 'a0000000000000000000000000000003', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 3, type: 'TypeA' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getAggregateEvents('a0000000000000000000000000000010', { eventTypes: ['TypeA'] }))
				results.push(event);

			expect(results).toEqual([event1, event3]);
		});

		it('yields tail event when tail is "last" and it was not already yielded', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1, type: 'TypeA' };
			const event2 = { id: 'a0000000000000000000000000000002', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 2, type: 'TypeB' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('a0000000000000000000000000000010', { eventTypes: ['TypeA'], tail: 'last' }))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});
	});

	describe('getSagaEvents', () => {

		it('yields saga events from origin up to beforeEvent', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaStarted' };
			const event2 = { id: 'a0000000000000000000000000000002', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaProgressed' };
			const event3 = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaProgressed' };
			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' } };
			const results = [];
			for await (const event of storage.getSagaEvents('SagaA:a0000000000000000000000000000001', { beforeEvent } as any))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('always includes origin event even without a sagaOrigins self-reference', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', type: 'SagaStarted' };
			const event2 = { id: 'a0000000000000000000000000000002', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaProgressed' };
			const event3 = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaProgressed' };
			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' } };
			const results = [];
			for await (const event of storage.getSagaEvents('SagaA:a0000000000000000000000000000001', { beforeEvent } as any))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('supports events participating in multiple sagas', async () => {
			const event1 = {
				id: 'a0000000000000000000000000000001',
				sagaOrigins: {
					SagaA: 'a0000000000000000000000000000001',
					SagaB: 'a0000000000000000000000000000001'
				},
				type: 'SagaEvent'
			};
			const event2 = { id: 'a0000000000000000000000000000002', sagaOrigins: { SagaB: 'a0000000000000000000000000000001' }, type: 'SagaEvent' };
			const event3 = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaB: 'a0000000000000000000000000000001' }, type: 'SagaEvent' };

			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { id: 'a0000000000000000000000000000003', sagaOrigins: { SagaB: 'a0000000000000000000000000000001' } };
			const results = [];
			for await (const event of storage.getSagaEvents('SagaB:a0000000000000000000000000000001', { beforeEvent } as any))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('throws when beforeEvent.sagaOrigins does not match sagaId', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' }, type: 'SagaStarted' };
			await storage.commitEvents([event1]);

			const beforeEvent = { id: 'a0000000000000000000000000000001', sagaOrigins: { SagaA: 'a0000000000000000000000000000002' } };
			const stream = storage.getSagaEvents('SagaA:a0000000000000000000000000000001', { beforeEvent } as any);

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
			await storage.commitEvents([{
				id: 'a0000000000000000000000000000002',
				sagaOrigins: { SagaA: 'a0000000000000000000000000000001' },
				type: 'SagaProgressed'
			}]);

			const beforeEvent = { id: 'a0000000000000000000000000000002', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' } };
			const stream = storage.getSagaEvents('SagaA:a0000000000000000000000000000001', { beforeEvent } as any);

			try {
				await stream.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('origin event a0000000000000000000000000000001 not found');
			}
		});

		it('throws when beforeEvent cannot be found in storage', async () => {
			await storage.commitEvents([{
				id: 'a0000000000000000000000000000001',
				sagaOrigins: { SagaA: 'a0000000000000000000000000000001' },
				type: 'SagaStarted'
			}]);

			const beforeEvent = { id: 'a0000000000000000000000000000099', sagaOrigins: { SagaA: 'a0000000000000000000000000000001' } };
			const stream = storage.getSagaEvents('SagaA:a0000000000000000000000000000001', { beforeEvent } as any);

			try {
				await stream.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('beforeEvent a0000000000000000000000000000099 not found');
			}
		});
	});

	describe('getEventsByTypes', () => {

		it('yields events matching the provided types', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', type: 'A' };
			const event2 = { id: 'a0000000000000000000000000000002', type: 'B' };
			const event3 = { id: 'a0000000000000000000000000000003', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A']))
				results.push(event);

			expect(results).toEqual([event1, event3]);
		});

		it('yields events only after the given afterEvent id', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', type: 'A' };
			const event2 = { id: 'a0000000000000000000000000000002', type: 'A' };
			const event3 = { id: 'a0000000000000000000000000000003', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const options = { afterEvent: { id: 'a0000000000000000000000000000001' } };
			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], options as any))
				results.push(event);

			expect(results).toEqual([event2, event3]);
		});

		it('throws error if afterEvent is provided without id', async () => {
			const event1 = { id: 'a0000000000000000000000000000001', type: 'A' };
			await storage.commitEvents([event1]);
			const options = { afterEvent: {} };

			const gen = storage.getEventsByTypes(['A'], options as any);
			try {
				await gen.next();
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err).toBeInstanceOf(TypeError);
				expect(err.message).toBe('options.afterEvent.id must be a non-empty String');
			}
		});
	});

	describe('getNewId', () => {

		it('returns hex strings without dashes', () => {
			const id1 = storage.getNewId();
			const id2 = storage.getNewId();
			expect(typeof id1).toBe('string');
			expect(typeof id2).toBe('string');
			expect(id1).not.toBe(id2);
			expect(id1).toMatch(/^[0-9a-f]{32}$/);
		});
	});

	describe('process', () => {

		it('commits events from pipeline batch', async () => {
			const event = { id: 'a0000000000000000000000000000001', type: 'TestEvent', aggregateId: 'a0000000000000000000000000000010', aggregateVersion: 1 };
			const batch = [{ event, origin: 'test-origin' }];

			await storage.process(batch);

			const results = [];
			for await (const e of storage.getAggregateEvents('a0000000000000000000000000000010'))
				results.push(e);

			expect(results).toEqual([event]);
		});

		it('throws when batch item does not contain event', async () => {
			try {
				await storage.process([{}] as any);
				throw new Error('Expected error was not thrown');
			}
			catch (err: any) {
				expect(err.message).toBe('Event batch does not contain `event`');
			}
		});
	});
});
