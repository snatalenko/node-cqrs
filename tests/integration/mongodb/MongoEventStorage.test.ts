/**
 * Integration tests for MongoEventStorage.
 * Requires a running MongoDB instance at mongodb://localhost:27017.
 * Start with: docker run -d -p 27017:27017 mongo:7
 */
import { type Db, MongoClient } from 'mongodb';
import { MongoEventStorage } from '../../../src/mongodb/MongoEventStorage.ts';
import { ConcurrencyError } from '../../../src';

const CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING ?? 'mongodb://localhost:27017/node_cqrs_test';
const COLLECTION = 'events_test';

describe('MongoEventStorage (integration)', () => {

	let storage: MongoEventStorage;
	let client: MongoClient;
	let db: Db;

	beforeAll(async () => {
		client = new MongoClient(CONNECTION_STRING);
		await client.connect();
		db = client.db();
	});

	afterAll(async () => {
		await client.close();
	});

	beforeEach(async () => {
		// Drop test collection before each test for isolation
		try {
			await db.collection(COLLECTION).drop();
		}
		catch {
			// ignore "ns not found" errors if collection doesn't exist yet
		}

		storage = new MongoEventStorage({
			mongoDbFactory: () => db,
			mongoEventStorageConfig: { collection: COLLECTION }
		});
	});

	describe('getNewId', () => {
		it('returns a unique 24-char hex string', () => {
			const id1 = storage.getNewId();
			const id2 = storage.getNewId();
			expect(id1).toMatch(/^[0-9a-f]{24}$/);
			expect(id1).not.toBe(id2);
		});
	});

	describe('commitEvents', () => {
		it('persists events and assigns ids', async () => {
			const events = [
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1, payload: { name: 'Alice' } }
			];

			const result = await storage.commitEvents(events as any);

			expect(result).toHaveLength(1);
			expect(typeof (result[0] as any).id).toBe('string');
			expect((result[0] as any).id).toMatch(/^[0-9a-f]{24}$/);
		});

		it('throws ConcurrencyError on duplicate aggregateVersion', async () => {
			const aggregateId = storage.getNewId();
			await storage.commitEvents([
				{ type: 'UserCreated', aggregateId, aggregateVersion: 1 }
			] as any);

			await expect(
				storage.commitEvents([
					{ type: 'UserCreated', aggregateId, aggregateVersion: 1 }
				] as any)
			).rejects.toBeInstanceOf(ConcurrencyError);
		});

		it('throws when ignoreConcurrencyError is true', async () => {
			const aggregateId = storage.getNewId();

			await expect(
				storage.commitEvents(
					[{ type: 'UserCreated', aggregateId, aggregateVersion: 1 }] as any,
					{ ignoreConcurrencyError: true }
				)
			).rejects.toThrow('ignoreConcurrencyError is not supported by MongoEventStorage');
		});
	});

	describe('getAggregateEvents', () => {
		it('retrieves events for a specific aggregate', async () => {
			const aggregateId = storage.getNewId();
			const otherAggregateId = storage.getNewId();

			await storage.commitEvents([
				{ type: 'UserCreated', aggregateId, aggregateVersion: 1 },
				{ type: 'UserUpdated', aggregateId, aggregateVersion: 2 },
				{ type: 'UserCreated', aggregateId: otherAggregateId, aggregateVersion: 1 }
			] as any);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggregateId))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('UserCreated');
			expect(results[1].type).toBe('UserUpdated');
			expect(results.every(e => e.aggregateId === aggregateId)).toBe(true);
		});

		it('filters by aggregateVersion after snapshot', async () => {
			const aggregateId = storage.getNewId();

			await storage.commitEvents([
				{ type: 'E1', aggregateId, aggregateVersion: 1 },
				{ type: 'E2', aggregateId, aggregateVersion: 2 },
				{ type: 'E3', aggregateId, aggregateVersion: 3 }
			] as any);

			const snapshot = { type: 'snapshot' as const, aggregateVersion: 1, payload: {} };
			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggregateId, { snapshot }))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results[0].aggregateVersion).toBe(2);
			expect(results[1].aggregateVersion).toBe(3);
		});

		it('filters by eventTypes', async () => {
			const aggregateId = storage.getNewId();

			await storage.commitEvents([
				{ type: 'Created', aggregateId, aggregateVersion: 1 },
				{ type: 'Updated', aggregateId, aggregateVersion: 2 },
				{ type: 'Created', aggregateId, aggregateVersion: 3 }
			] as any);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggregateId, { eventTypes: ['Created'] }))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results.every(e => e.type === 'Created')).toBe(true);
		});

		it('yields tail event when tail=last and type filter is active', async () => {
			const aggregateId = storage.getNewId();

			await storage.commitEvents([
				{ type: 'Created', aggregateId, aggregateVersion: 1 },
				{ type: 'Updated', aggregateId, aggregateVersion: 2 }
			] as any);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggregateId, { eventTypes: ['Created'], tail: 'last' }))
				results.push(e);

			// Should yield 'Created' (version 1) AND the tail 'Updated' (version 2)
			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('Created');
			expect(results[1].type).toBe('Updated');
		});

		it('sorts events by aggregateVersion ascending', async () => {
			const aggregateId = storage.getNewId();

			// Commit out of order by using separate calls (can't insert duplicates)
			await storage.commitEvents([
				{ type: 'E1', aggregateId, aggregateVersion: 1 },
				{ type: 'E3', aggregateId, aggregateVersion: 3 },
				{ type: 'E2', aggregateId, aggregateVersion: 2 }
			] as any);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggregateId))
				results.push(e);

			expect(results.map(e => e.aggregateVersion)).toEqual([1, 2, 3]);
		});
	});

	describe('getSagaEvents', () => {
		it('retrieves origin event and saga events up to beforeEvent', async () => {
			// Drop and recreate with a fresh storage
			await db.collection(COLLECTION).drop().catch(() => {});
			const newStorage = new MongoEventStorage({
				mongoDbFactory: () => db,
				mongoEventStorageConfig: { collection: COLLECTION }
			});

			const originEventId = newStorage.getNewId();
			const eventsWithOrigins: any[] = [
				// Origin event — does NOT have sagaOrigins for SagaA
				{ id: originEventId, type: 'SagaStarted' },
				{ type: 'SagaProgressed', sagaOrigins: { SagaA: originEventId } },
				{ type: 'SagaFinished', sagaOrigins: { SagaA: originEventId } }
			];

			await newStorage.commitEvents(eventsWithOrigins as any);

			const beforeEvent = eventsWithOrigins[2];
			const results: any[] = [];
			for await (const e of newStorage.getSagaEvents(`SagaA:${originEventId}`, { beforeEvent }))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results[0].type).toBe('SagaStarted');
			expect(results[0].id).toBe(originEventId);
			expect(results[1].type).toBe('SagaProgressed');
		});
	});

	describe('getEventsByTypes', () => {
		it('retrieves events matching specified types', async () => {
			await storage.commitEvents([
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 },
				{ type: 'OrderCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 },
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 }
			] as any);

			const results: any[] = [];
			for await (const e of storage.getEventsByTypes(['UserCreated']))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results.every(e => e.type === 'UserCreated')).toBe(true);
		});

		it('retrieves events after a given event', async () => {
			const events: any[] = [
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 },
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 },
				{ type: 'UserCreated', aggregateId: storage.getNewId(), aggregateVersion: 1 }
			];
			await storage.commitEvents(events as any);

			const afterEvent = events[0];
			const results: any[] = [];
			for await (const e of storage.getEventsByTypes(['UserCreated'], { afterEvent }))
				results.push(e);

			expect(results).toHaveLength(2);
			expect(results[0].id).toBe(events[1].id);
		});
	});
});
