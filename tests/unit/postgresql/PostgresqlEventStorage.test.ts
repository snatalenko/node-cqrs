import { ConcurrencyError } from '../../../src/index.ts';
import { PostgresqlEventStorage } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('PostgresqlEventStorage', () => {
	let db: MockPostgresqlConnection;
	let storage: PostgresqlEventStorage;

	beforeEach(async () => {
		db = new MockPostgresqlConnection();
		storage = new PostgresqlEventStorage({ viewModelPostgresqlDb: db });
		await storage.assertConnection();
	});

	describe('constructor', () => {
		it('uses custom table names from postgresqlEventStorageConfig', async () => {
			const customDb = new MockPostgresqlConnection();
			const customStorage = new PostgresqlEventStorage({
				viewModelPostgresqlDb: customDb,
				postgresqlEventStorageConfig: {
					eventsTableName: 'custom_events',
					eventSagasTableName: 'custom_event_sagas'
				}
			});

			await customStorage.commitEvents([{ id: 'event1', type: 'Created' }]);

			expect(customDb.events).toHaveLength(1);
		});

		it('validates custom table names', () => {
			expect(() => new PostgresqlEventStorage({
				viewModelPostgresqlDb: db,
				postgresqlEventStorageConfig: {
					eventsTableName: ''
				}
			})).toThrow('postgresqlEventStorageConfig.eventsTableName must be a non-empty String');

			expect(() => new PostgresqlEventStorage({
				viewModelPostgresqlDb: db,
				postgresqlEventStorageConfig: {
					eventSagasTableName: ''
				}
			})).toThrow('postgresqlEventStorageConfig.eventSagasTableName must be a non-empty String');
		});
	});

	describe('getNewId', () => {
		it('returns hex strings without dashes', () => {
			const first = storage.getNewId();
			const second = storage.getNewId();

			expect(first).toMatch(/^[0-9a-f]{32}$/);
			expect(second).toMatch(/^[0-9a-f]{32}$/);
			expect(first).not.toBe(second);
		});
	});

	describe('commitEvents', () => {
		it('commits events in a transaction and returns them', async () => {
			const events = [
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' }
			];

			const result = await storage.commitEvents(events);

			expect(result).toBe(events);
			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(db.events).toHaveLength(1);
			expect(db.events[0]).toMatchObject({
				id: 'event1',
				aggregateId: 'aggregate1',
				aggregateVersion: 1,
				type: 'Created'
			});
		});

		it('assigns ids to events that do not already have one', async () => {
			const event = { aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };

			await storage.commitEvents([event]);

			expect(event).toHaveProperty('id');
			expect((event as any).id).toMatch(/^[0-9a-f]{32}$/);
		});

		it('throws ConcurrencyError when committing a duplicate aggregateVersion for the same aggregate', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			]);

			await expect(storage.commitEvents([
				{ id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			])).rejects.toBeInstanceOf(ConcurrencyError);

			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
		});

		it('allows duplicate aggregateVersion when ignoreConcurrencyError option is enabled', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			]);

			const duplicate = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };

			await storage.commitEvents([duplicate], { ignoreConcurrencyError: true });

			expect(db.events.map(event => event.id)).toEqual(['event1', 'event2']);
		});

		it('rolls back earlier batch inserts when a later insert fails', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' }
			]);

			await expect(storage.commitEvents([
				{ id: 'event2', aggregateId: 'aggregate2', aggregateVersion: 1, type: 'Created' },
				{ id: 'event1', aggregateId: 'aggregate3', aggregateVersion: 1, type: 'Created' }
			])).rejects.toThrow('duplicate key value violates unique constraint');

			expect(db.events.map(event => event.id)).toEqual(['event1']);
		});

		it('stores saga references for committed events', async () => {
			await storage.commitEvents([{
				id: 'event1',
				type: 'SagaProgressed',
				sagaOrigins: {
					SagaA: 'origin1',
					SagaB: 'origin2'
				}
			}]);

			expect(db.eventSagaRefs).toEqual([
				{ sagaDescriptor: 'SagaA', originId: 'origin1', eventId: 'event1' },
				{ sagaDescriptor: 'SagaB', originId: 'origin2', eventId: 'event1' }
			]);
		});
	});

	describe('getAggregateEvents', () => {
		it('yields events with matching aggregateId', async () => {
			const event1 = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			const event2 = { id: 'event2', aggregateId: 'aggregate2', aggregateVersion: 1, type: 'Created' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('aggregate1'))
				results.push(event);

			expect(results).toEqual([event1]);
		});

		it('parses stringified json data returned by PostgreSQL clients', async () => {
			const event = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			await storage.commitEvents([event]);
			db.events[0].data = JSON.stringify(db.events[0].data);

			const results = [];
			for await (const e of storage.getAggregateEvents('aggregate1'))
				results.push(e);

			expect(results).toEqual([event]);
		});

		it('filters by snapshot version and event types while preserving tail event', async () => {
			const event1 = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			const event2 = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 2, type: 'Updated' };
			const event3 = { id: 'event3', aggregateId: 'aggregate1', aggregateVersion: 3, type: 'Deleted' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getAggregateEvents('aggregate1', {
				snapshot: { type: 'snapshot', aggregateVersion: 1, payload: {} },
				eventTypes: ['Updated'],
				tail: 'last'
			}))
				results.push(event);

			expect(results).toEqual([event2, event3]);
		});
	});

	describe('getSagaEvents', () => {
		it('yields origin event and saga events up to beforeEvent', async () => {
			const event1 = { id: 'event1', type: 'SagaStarted' };
			const event2 = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };
			const event3 = { id: 'event3', sagaOrigins: { SagaA: 'event1' }, type: 'SagaFinished' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getSagaEvents('SagaA:event1', { beforeEvent: event3 }))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('throws when beforeEvent.sagaOrigins does not match sagaId', async () => {
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event2' }, type: 'SagaProgressed' };

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('beforeEvent.sagaOrigins does not match sagaId');
		});

		it('throws when origin event cannot be found', async () => {
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };
			await storage.commitEvents([beforeEvent]);

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('origin event event1 not found');
		});

		it('throws when beforeEvent cannot be found', async () => {
			await storage.commitEvents([{ id: 'event1', type: 'SagaStarted' }]);
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('beforeEvent event2 not found');
		});
	});

	describe('getEventsByTypes', () => {
		it('yields events matching the provided types after the given event', async () => {
			const event1 = { id: 'event1', type: 'A' };
			const event2 = { id: 'event2', type: 'B' };
			const event3 = { id: 'event3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], { afterEvent: event1 }))
				results.push(event);

			expect(results).toEqual([event3]);
		});

		it('yields no events when afterEvent id is provided but not found in storage', async () => {
			await storage.commitEvents([{ id: 'event1', type: 'A' }]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], { afterEvent: { id: 'missing', type: 'A' } }))
				results.push(event);

			expect(results).toEqual([]);
		});

		it('throws error if afterEvent is provided without id', async () => {
			const stream = storage.getEventsByTypes(['A'], { afterEvent: { type: 'A' } });

			await expect(stream.next()).rejects.toThrow('options.afterEvent.id must be a non-empty String');
		});
	});

	describe('process', () => {
		it('commits events from pipeline batch with envelope metadata', async () => {
			const event = { id: 'event1', type: 'Created', aggregateId: 'aggregate1', aggregateVersion: 1 };
			const batch = [{ event, origin: 'test-origin' }];

			await storage.process(batch);

			expect(db.events[0].meta).toEqual({ origin: 'test-origin' });
		});

		it('forwards ignoreConcurrencyError from the envelope', async () => {
			const event = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };
			await storage.process([{ event }]);

			const duplicate = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };

			await expect(storage.process([{ event: duplicate }])).rejects.toBeInstanceOf(ConcurrencyError);
			await expect(storage.process([{ event: duplicate, ignoreConcurrencyError: true }])).resolves.toBeDefined();
		});

		it('throws when batch item does not contain event', async () => {
			await expect(storage.process([{}] as any))
				.rejects.toThrow('Event batch does not contain `event`');
		});
	});
});
