/**
 * Integration tests for MongoViewLocker and MongoEventLocker.
 * Requires a running MongoDB instance at mongodb://localhost:27017.
 * Start with: docker run -d -p 27017:27017 mongo:7
 */
import { type Db, MongoClient } from 'mongodb';
import { promisify } from 'util';
import { MongoViewLocker, MongoEventLocker } from '../../../src/mongodb/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';

const delay = promisify(setTimeout);

const CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING ?? 'mongodb://localhost:27017/node_cqrs_test';

describe('Mongo Lockers (integration)', () => {

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
		await db.collection('ncqrs_view_locks').drop().catch(() => { /* ignore */ });
		await db.collection('ncqrs_event_locks').drop().catch(() => { /* ignore */ });
	});

	describe('MongoViewLocker', () => {

		let firstLock: MongoViewLocker;
		let secondLock: MongoViewLocker;
		const viewLockTtl = 500;

		beforeEach(async () => {
			const opts = {
				viewModelMongoDb: db,
				projectionName: 'inttest',
				schemaVersion: '1',
				viewLockTtl
			};
			firstLock = new MongoViewLocker(opts);
			secondLock = new MongoViewLocker(opts);
			await firstLock.assertConnection();
			await secondLock.assertConnection();
		});

		afterEach(async () => {
			if (firstLock && !firstLock.ready)
				await firstLock.unlock();
			if (secondLock && !secondLock.ready)
				await secondLock.unlock();
		});

		it('locks successfully', async () => {
			expect(await firstLock.lock()).toBe(true);
			expect(firstLock.ready).toBe(false);
		});

		it('unlocks and sets ready to true', async () => {
			await firstLock.lock();
			await firstLock.unlock();
			expect(firstLock.ready).toBe(true);
		});

		it('second lock acquires once first is released', async () => {
			await firstLock.lock();

			let secondAcquired = false;
			const secondAcquiring = secondLock.lock().then(() => {
				secondAcquired = true;
			});

			await delay(50);
			expect(secondAcquired).toBe(false);

			await firstLock.unlock();
			await secondAcquiring;
			expect(secondAcquired).toBe(true);
			await secondLock.unlock();
		});

		it('once("ready") resolves after unlock', async () => {
			await firstLock.lock();

			let resolved = false;
			const waiting = firstLock.once('ready').then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);
			await firstLock.unlock();
			await waiting;
			expect(resolved).toBe(true);
		});
	});

	describe('MongoEventLocker', () => {

		const testEvent: IEvent = { id: 'evt-int-001', type: 'TEST', payload: {} };
		let locker: MongoEventLocker;

		beforeEach(async () => {
			locker = new MongoEventLocker({
				viewModelMongoDb: db,
				projectionName: 'inttest',
				schemaVersion: '1',
				eventLockTtl: 200
			});
			await locker.assertConnection();
		});

		it('tryMarkAsProjecting returns true on first call', async () => {
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
		});

		it('tryMarkAsProjecting returns false when already locked', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(false);
		});

		it('markAsProjected finalises the event lock', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);

			const doc = await db.collection('ncqrs_event_locks').findOne({ _id: `inttest:1:${testEvent.id}` as any });
			expect((doc as any)?.processedAt).toBeInstanceOf(Date);
		});

		it('tryMarkAsProjecting returns false after processed', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(false);
		});

		it('allows re-locking after TTL expires', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await delay(250); // past the 200ms TTL
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
		});

		it('markAsProjected throws when event was never locked', async () => {
			await expect(() => locker.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});

		it('stores and retrieves the last event', async () => {
			await locker.markAsLastEvent(testEvent);
			expect(await locker.getLastEvent()).toEqual(testEvent);
		});

		it('returns undefined for getLastEvent when none stored', async () => {
			expect(await locker.getLastEvent()).toBeUndefined();
		});

		it('overwrites the previous last event', async () => {
			const second: IEvent = { id: 'evt-int-002', type: 'TEST2', payload: {} };
			await locker.markAsLastEvent(testEvent);
			await locker.markAsLastEvent(second);
			expect(await locker.getLastEvent()).toEqual(second);
		});
	});
});
