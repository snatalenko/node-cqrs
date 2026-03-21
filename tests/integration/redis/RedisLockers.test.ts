import Redis from 'ioredis';
import { promisify } from 'util';
import { RedisViewLocker, RedisEventLocker } from '../../../src/redis/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';

const delay = promisify(setTimeout);

const KEY_PATTERN = 'ncqrs:*';

/**
 * Integration tests for RedisViewLocker and RedisEventLocker.
 *
 * Requires a running Redis at redis://localhost:6379.
 * Start with: docker run -d --rm --name node-cqrs-redis -p 6379:6379 redis:7-alpine
 */
describe('Redis Lockers (integration)', () => {

	let redis: Redis;

	beforeEach(async () => {
		redis = new Redis({ host: 'localhost', port: 6379 });
		const keys = await redis.keys(KEY_PATTERN);
		if (keys.length)
			await redis.del(...keys);
	});

	afterEach(async () => {
		await redis.quit();
	});

	describe('RedisViewLocker', () => {

		let firstLock: RedisViewLocker;
		let secondLock: RedisViewLocker;
		const viewLockTtl = 500;

		beforeEach(async () => {
			const opts = {
				viewModelRedis: redis,
				projectionName: 'inttest',
				schemaVersion: '1',
				viewLockTtl
			};
			firstLock = new RedisViewLocker(opts);
			secondLock = new RedisViewLocker(opts);
			await firstLock.assertConnection();
			await secondLock.assertConnection();
		});

		afterEach(async () => {
			if (!firstLock.ready)
				await firstLock.unlock();
			if (!secondLock.ready)
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

		it('stores the lock key in Redis', async () => {
			await firstLock.lock();
			const val = await redis.get('ncqrs:viewlock:inttest:1');
			expect(val).toEqual(expect.any(String));
			await firstLock.unlock();
		});

		it('second lock acquires once first is released', async () => {
			await firstLock.lock();

			let secondAcquired = false;
			const secondAcquiring = secondLock.lock().then(() => {
				secondAcquired = true;
			});

			// Give firstLock a moment to be seen as held
			await delay(50);
			expect(secondAcquired).toBe(false);

			await firstLock.unlock();
			await secondAcquiring;
			expect(secondAcquired).toBe(true);
			await secondLock.unlock();
		});

		it('prolongs the lock before TTL expires', async () => {
			await firstLock.lock();

			const ttlBefore = await redis.pttl('ncqrs:viewlock:inttest:1');
			expect(ttlBefore).toBeGreaterThan(0);

			// Wait for prolongation to fire (at ttl/2 = 250ms), then check TTL again
			await delay((viewLockTtl / 2) + 50);

			const ttlAfter = await redis.pttl('ncqrs:viewlock:inttest:1');

			// TTL should be near the full viewLockTtl again after prolongation
			expect(ttlAfter).toBeGreaterThan(viewLockTtl / 2);
			await firstLock.unlock();
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

	describe('RedisEventLocker', () => {

		const testEvent: IEvent = { id: 'evt-int-001', type: 'TEST', payload: {} };
		let locker: RedisEventLocker;

		beforeEach(async () => {
			locker = new RedisEventLocker({
				viewModelRedis: redis,
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

			const key = `ncqrs:evtlock:inttest:1:${testEvent.id}`;
			expect(await redis.get(key)).toBe('processed');
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
