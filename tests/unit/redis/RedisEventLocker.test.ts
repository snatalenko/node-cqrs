import type { Redis } from 'ioredis';
import { RedisEventLocker } from '../../../src/redis/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';
import { createMockRedisForLockers } from './mockRedisForLockers.ts';
import { promisify } from 'util';

const delay = promisify(setTimeout);

const testEvent: IEvent = { id: 'evt-001', type: 'TEST_EVENT', payload: {} };

describe('RedisEventLocker', () => {

	let mockRedis: ReturnType<typeof createMockRedisForLockers>;
	let locker: RedisEventLocker;

	beforeEach(async () => {
		mockRedis = createMockRedisForLockers();
		locker = new RedisEventLocker({
			viewModelRedis: mockRedis as unknown as Redis,
			projectionName: 'test',
			schemaVersion: '1.0',
			eventLockTtl: 50 // 50ms — short for TTL-expiry test
		});
		await locker.assertConnection();
	});

	describe('constructor', () => {

		it('throws when neither viewModelRedis nor factory is provided', () => {
			expect(() => new RedisEventLocker({ projectionName: 'p', schemaVersion: '1' }))
				.toThrow('either viewModelRedis or viewModelRedisFactory argument required');
		});

		it('throws when projectionName is missing', () => {
			expect(() => new RedisEventLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: '',
				schemaVersion: '1'
			})).toThrow('o.projectionName must be a non-empty String');
		});

		it('throws when schemaVersion is missing', () => {
			expect(() => new RedisEventLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: 'p',
				schemaVersion: ''
			})).toThrow('o.schemaVersion must be a non-empty String');
		});
	});

	describe('tryMarkAsProjecting', () => {

		it('returns true on first call for a new event', async () => {
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
		});

		it('returns false when event is already locked', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(false);
		});

		it('returns false when event is already processed', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(false);
		});

		it('allows re-locking after TTL expires', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await delay(60); // wait past the 50ms TTL
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
		});

		it('sets key with "processing" marker and TTL', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			const key = `ncqrs:evtlock:test:1.0:${testEvent.id}`;
			expect(mockRedis.getAlive(key)).toBe('processing');
		});

		it('uses md5 for events without an id', async () => {
			const eventWithoutId: IEvent = { type: 'NO_ID', payload: {} };
			const result = await locker.tryMarkAsProjecting(eventWithoutId);
			expect(result).toBe(true);
		});
	});

	describe('markAsProjected', () => {

		it('transitions "processing" to "processed"', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);

			const key = `ncqrs:evtlock:test:1.0:${testEvent.id}`;
			expect(mockRedis.getAlive(key)).toBe('processed');
		});

		it('throws if event was never locked', async () => {
			await expect(() => locker.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});

		it('throws if event lock has already expired', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await delay(60); // TTL expires
			await expect(() => locker.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});

		it('throws if called twice', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);
			await expect(() => locker.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});
	});

	describe('markAsLastEvent / getLastEvent', () => {

		it('returns undefined when no event has been stored', async () => {
			expect(await locker.getLastEvent()).toBeUndefined();
		});

		it('stores and retrieves the last event', async () => {
			await locker.markAsLastEvent(testEvent);
			expect(await locker.getLastEvent()).toEqual(testEvent);
		});

		it('overwrites the previous last event', async () => {
			const secondEvent: IEvent = { id: 'evt-002', type: 'TEST_EVENT_2', payload: {} };
			await locker.markAsLastEvent(testEvent);
			await locker.markAsLastEvent(secondEvent);
			expect(await locker.getLastEvent()).toEqual(secondEvent);
		});

		it('markAsProjected alone does not record the last event', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);
			expect(await locker.getLastEvent()).toBeUndefined();
		});
	});

	describe('keyPrefix', () => {

		it('uses custom keyPrefix for event lock keys', async () => {
			const customLocker = new RedisEventLocker({
				viewModelRedis: mockRedis as unknown as Redis,
				projectionName: 'myproj',
				schemaVersion: '2',
				keyPrefix: 'myapp'
			});
			await customLocker.assertConnection();
			await customLocker.tryMarkAsProjecting(testEvent);

			const key = `myapp:evtlock:myproj:2:${testEvent.id}`;
			expect(mockRedis.getAlive(key)).toBe('processing');
		});
	});
});
