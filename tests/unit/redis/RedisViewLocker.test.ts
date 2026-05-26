import type { Redis } from 'ioredis';
import { RedisViewLocker } from '../../../src/redis/index.ts';
import { createMockRedisForLockers } from './mockRedisForLockers.ts';

describe('RedisViewLocker', () => {

	const viewLockTtl = 1_000; // 1s — short enough for fake-timer tests

	let mockRedis: ReturnType<typeof createMockRedisForLockers>;
	let firstLock: RedisViewLocker;
	let secondLock: RedisViewLocker;

	beforeEach(async () => {
		mockRedis = createMockRedisForLockers();

		const opts = {
			viewModelRedis: mockRedis as unknown as Redis,
			projectionName: 'test',
			schemaVersion: '1.0',
			viewLockTtl
		};
		firstLock = new RedisViewLocker(opts);
		secondLock = new RedisViewLocker(opts);

		await firstLock.assertConnection();
		await secondLock.assertConnection();

		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('constructor', () => {

		it('throws when neither viewModelRedis nor factory is provided', () => {
			expect(() => new RedisViewLocker({ projectionName: 'p', schemaVersion: '1' }))
				.toThrow('either viewModelRedis or viewModelRedisFactory argument required');
		});

		it('throws when projectionName is missing', () => {
			expect(() => new RedisViewLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: '',
				schemaVersion: '1'
			})).toThrow('o.projectionName must be a non-empty String');
		});

		it('throws when schemaVersion is missing', () => {
			expect(() => new RedisViewLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: 'p',
				schemaVersion: ''
			})).toThrow('o.schemaVersion must be a non-empty String');
		});
	});

	describe('lock / unlock / ready', () => {

		it('locks successfully and returns true', async () => {
			const result = await firstLock.lock();
			expect(result).toBe(true);
		});

		it('sets ready to false while locked', async () => {
			await firstLock.lock();
			expect(firstLock.ready).toBe(false);
		});

		it('sets ready to true after unlock', async () => {
			await firstLock.lock();
			await firstLock.unlock();
			expect(firstLock.ready).toBe(true);
		});

		it('stores the lock key in Redis', async () => {
			await firstLock.lock();
			const key = 'ncqrs:viewlock:test:1.0';
			expect(mockRedis.getAlive(key)).toEqual(expect.any(String));
		});

		it('removes the lock key from Redis after unlock', async () => {
			await firstLock.lock();
			await firstLock.unlock();
			const key = 'ncqrs:viewlock:test:1.0';
			expect(mockRedis.store.has(key)).toBe(false);
		});

		it('unlocks gracefully when no lock exists', async () => {
			await expect(firstLock.unlock()).resolves.not.toThrow();
		});
	});

	describe('waiting for an existing lock', () => {

		it('does not acquire while another lock is held', async () => {
			await firstLock.lock();

			let secondLockAcquired = false;
			const secondLockAcquiring = secondLock.lock().then(() => {
				secondLockAcquired = true;
			});

			// Advance by a full TTL — secondLock retries but firstLock still holds it
			await jest.advanceTimersByTimeAsync(viewLockTtl);
			expect(secondLockAcquired).toBe(false);

			// Release firstLock, then let secondLock's next retry fire
			await firstLock.unlock();
			await jest.advanceTimersByTimeAsync((viewLockTtl / 2) + 10);
			await secondLockAcquiring;

			expect(secondLockAcquired).toBe(true);
		});

		it('second lock acquires once first is released', async () => {
			await firstLock.lock();
			const secondLockResult = secondLock.lock();

			await firstLock.unlock();
			await jest.advanceTimersByTimeAsync((viewLockTtl / 2) + 10);

			expect(await secondLockResult).toBe(true);
		});
	});

	describe('lock prolongation', () => {

		it('prolongs the lock before TTL expires', async () => {
			await firstLock.lock();

			const entry = mockRedis.store.get('ncqrs:viewlock:test:1.0');
			expect(entry).toBeDefined();

			// Advance by half the TTL to trigger prolongation
			await jest.advanceTimersByTimeAsync((viewLockTtl / 2) + 10);

			// PEXPIRE is called — the key should still be present and owned
			expect(mockRedis.getAlive('ncqrs:viewlock:test:1.0')).toEqual(expect.any(String));
		});

		it('throws if prolongation is attempted after unlock', async () => {
			await firstLock.lock();
			await firstLock.unlock();

			await expect((firstLock as any).prolongLock())
				.rejects.toThrow('"test" lock could not be prolonged');
		});

		it('does not prolong or delete another process lock after ownership changes', async () => {
			await firstLock.lock();

			const key = 'ncqrs:viewlock:test:1.0';
			const firstEntry = mockRedis.store.get(key)!;
			firstEntry.expiresAt = Date.now() - 1;

			await secondLock.lock();
			const secondToken = mockRedis.getAlive(key);
			expect(secondToken).toEqual(expect.any(String));

			await expect((firstLock as any).prolongLock())
				.rejects.toThrow('"test" lock could not be prolonged');

			await firstLock.unlock();

			expect(mockRedis.getAlive(key)).toBe(secondToken);
		});
	});

	describe('once()', () => {

		it('resolves immediately when not locked', async () => {
			await expect(firstLock.once('ready')).resolves.toBeUndefined();
		});

		it('resolves after unlock', async () => {
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

		it('throws for unexpected event types', () => {
			expect(() => firstLock.once('unexpected' as any))
				.toThrow('Unexpected event: unexpected');
		});
	});

	describe('keyPrefix', () => {

		it('uses custom keyPrefix in the lock key', async () => {
			const locker = new RedisViewLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: 'myproj',
				schemaVersion: '2',
				keyPrefix: 'myapp'
			});
			await locker.assertConnection();
			await locker.lock();

			expect(mockRedis.getAlive('myapp:viewlock:myproj:2')).toEqual(expect.any(String));
		});
	});
});
