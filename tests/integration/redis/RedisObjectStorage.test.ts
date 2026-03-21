import Redis from 'ioredis';
import { RedisObjectStorage } from '../../../src/redis/index.ts';

type Item = { name: string; value: number };

/**
 * Integration tests for RedisObjectStorage.
 *
 * Requires a running Redis at redis://localhost:6379.
 * Start with: docker run -d --rm --name node-cqrs-redis -p 6379:6379 redis:7-alpine
 */
describe('RedisObjectStorage (integration)', () => {

	let redis: Redis;
	let storage: RedisObjectStorage<Item>;
	const TABLE = 'inttest_items';
	const KEY_PATTERN = `${TABLE}:*`;

	beforeEach(async () => {
		// Create a fresh connection per test so quit() in afterEach leaves no stale state
		redis = new Redis({ host: 'localhost', port: 6379 });

		// Clean up all keys from previous runs
		const keys = await redis.keys(KEY_PATTERN);
		if (keys.length)
			await redis.del(...keys);

		storage = new RedisObjectStorage<Item>({
			viewModelRedis: redis,
			tableName: TABLE
		});
		await storage.assertConnection();
	});

	afterEach(async () => {
		await redis.quit();
	});

	it('stores and retrieves an object', async () => {
		await storage.create('0001', { name: 'Test', value: 42 });
		expect(await storage.get('0001')).toEqual({ name: 'Test', value: 42 });
	});

	it('returns undefined for a non-existent key', async () => {
		expect(await storage.get('nonexistent')).toBeUndefined();
	});

	it('throws when creating a duplicate key', async () => {
		await storage.create('0002', { name: 'First', value: 1 });
		await expect(() => storage.create('0002', { name: 'Second', value: 2 }))
			.rejects.toThrow("Record '0002' could not be created");
	});

	it('updates an existing record', async () => {
		await storage.create('0003', { name: 'Old', value: 5 });
		await storage.update('0003', r => ({ ...r, value: 99 }));
		expect(await storage.get('0003')).toEqual({ name: 'Old', value: 99 });
	});

	it('throws when updating a non-existent record', async () => {
		await expect(() => storage.update('ghost', r => r))
			.rejects.toThrow("Record 'ghost' does not exist");
	});

	it('deletes an existing record', async () => {
		await storage.create('0004', { name: 'ToDelete', value: 0 });
		expect(await storage.delete('0004')).toBe(true);
		expect(await storage.get('0004')).toBeUndefined();
	});

	it('returns false when deleting a non-existent record', async () => {
		expect(await storage.delete('0000')).toBe(false);
	});

	it('creates via updateEnforcingNew when record is absent', async () => {
		await storage.updateEnforcingNew('0005', () => ({ name: 'Created', value: 1 }));
		expect(await storage.get('0005')).toEqual({ name: 'Created', value: 1 });
	});

	it('updates via updateEnforcingNew when record exists', async () => {
		await storage.create('0006', { name: 'Existing', value: 10 });
		await storage.updateEnforcingNew('0006', r => ({ ...r!, value: 20 }));
		expect(await storage.get('0006')).toEqual({ name: 'Existing', value: 20 });
	});

	it('version increments on each write', async () => {
		await storage.create('0007', { name: 'x', value: 0 });
		await storage.update('0007', r => ({ ...r, value: 1 }));
		await storage.update('0007', r => ({ ...r, value: 2 }));

		const raw = await redis.get(`${TABLE}:0007`);
		const envelope = JSON.parse(raw!);
		expect(envelope.v).toBe(3);
	});

	it('updateEnforcingNew is safe under same-process concurrency', async () => {
		const id = '00000000000000000000000000000001';
		const concurrency = 50;

		const results = await Promise.allSettled(
			Array.from({ length: concurrency }, () =>
				storage.updateEnforcingNew(id, r => ({
					name: 'counter',
					value: (r?.value ?? 0) + 1
				}))
			)
		);

		const rejected = results.filter(r => r.status === 'rejected');
		expect(rejected).toEqual([]);

		const record = await storage.get(id);
		expect(record).toEqual({ name: 'counter', value: concurrency });

		const raw = await redis.get(`${TABLE}:${id}`);
		const envelope = JSON.parse(raw!);
		expect(envelope.v).toBe(concurrency);
	});

	it('rejects invalid JSON stored directly in Redis', async () => {
		await redis.set(`${TABLE}:bad`, 'INVALID_JSON');
		await expect(() => storage.get('bad')).rejects.toThrow();
	});
});
