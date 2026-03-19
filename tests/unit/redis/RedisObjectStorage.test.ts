import type { Redis } from 'ioredis';
import { RedisObjectStorage } from '../../../src/redis/index.ts';
import { createMockRedis } from './mockRedis.ts';

type Item = { name: string; value: number };

describe('RedisObjectStorage', () => {

	let mockRedis: ReturnType<typeof createMockRedis>;
	let storage: RedisObjectStorage<Item>;

	beforeEach(async () => {
		mockRedis = createMockRedis();
		storage = new RedisObjectStorage<Item>({
			viewModelRedis: mockRedis as unknown as Redis,
			tableName: 'test_items'
		});
		await storage.assertConnection();
	});

	describe('constructor', () => {

		it('throws if neither viewModelRedis nor viewModelRedisFactory is provided', () => {
			expect(() => new RedisObjectStorage({ tableName: 'x' }))
				.toThrow('either viewModelRedis or viewModelRedisFactory argument required');
		});

		it('throws if tableName is missing or empty', () => {
			expect(() => new RedisObjectStorage({
				viewModelRedis: mockRedis as unknown as Redis,
				tableName: ''
			})).toThrow('o.tableName must be a non-empty String');
		});

		it('accepts a factory instead of a direct client', async () => {
			let factoryCalled = false;
			const s = new RedisObjectStorage<Item>({
				viewModelRedisFactory: () => {
					factoryCalled = true;
					return mockRedis as unknown as Redis;
				},
				tableName: 'test_items'
			});
			await s.assertConnection();
			expect(factoryCalled).toBe(true);
		});
	});

	describe('get', () => {

		it('returns undefined for a non-existent key', async () => {
			expect(await storage.get('missing')).toBeUndefined();
		});

		it('returns the stored record', async () => {
			await storage.create('a1', { name: 'Alice', value: 1 });
			expect(await storage.get('a1')).toEqual({ name: 'Alice', value: 1 });
		});

		it('throws on non-string id', async () => {
			await expect(() => storage.get(123 as unknown as string))
				.rejects.toThrow('id must be a non-empty String');
		});
	});

	describe('create', () => {

		it('stores a new record', async () => {
			await storage.create('b1', { name: 'Bob', value: 7 });
			const raw = mockRedis.store.get('test_items:b1');
			expect(raw).toBeDefined();

			const envelope = JSON.parse(raw!);
			expect(envelope.d).toEqual({ name: 'Bob', value: 7 });
			expect(envelope.v).toBe(1);
		});

		it('throws when creating a duplicate key', async () => {
			await storage.create('b2', { name: 'First', value: 1 });
			await expect(() => storage.create('b2', { name: 'Second', value: 2 }))
				.rejects.toThrow("Record 'b2' could not be created");
		});

		it('throws on non-string id', async () => {
			await expect(() => storage.create('' as string, { name: 'x', value: 0 }))
				.rejects.toThrow('id must be a non-empty String');
		});
	});

	describe('update', () => {

		it('updates an existing record and increments version', async () => {
			await storage.create('c1', { name: 'Old', value: 5 });
			await storage.update('c1', r => ({ ...r, value: 99 }));

			expect(await storage.get('c1')).toEqual({ name: 'Old', value: 99 });

			const envelope = JSON.parse(mockRedis.store.get('test_items:c1')!);
			expect(envelope.v).toBe(2);
		});

		it('throws when record does not exist', async () => {
			await expect(() => storage.update('ghost', r => r))
				.rejects.toThrow("Record 'ghost' does not exist");
		});

		it('throws on non-string id', async () => {
			await expect(() => storage.update('' as string, r => r))
				.rejects.toThrow('id must be a non-empty String');
		});

		it('throws on non-function update callback', async () => {
			await expect(() => storage.update('c2', null as unknown as () => Item))
				.rejects.toThrow('update must be a Function');
		});

		it('retries when version changes between read and write', async () => {
			await storage.create('c3', { name: 'conflict', value: 1 });

			let callCount = 0;

			await storage.update('c3', r => {
				callCount++;

				// Simulate an external version bump on the first call only
				if (callCount === 1) {
					const raw = mockRedis.store.get('test_items:c3')!;
					const env = JSON.parse(raw);
					env.v = 999;
					mockRedis.store.set('test_items:c3', JSON.stringify(env));
				}

				return { ...r, value: r.value + 1 };
			});

			expect(callCount).toBeGreaterThan(1);
			expect(await storage.get('c3')).toMatchObject({ value: 2 });
		});

		it('throws after exhausting retries', async () => {
			const s = new RedisObjectStorage<Item>({
				viewModelRedis: mockRedis as unknown as Redis,
				tableName: 'test_items',
				maxRetries: 0
			});
			await s.assertConnection();
			await s.create('c4', { name: 'x', value: 0 });

			// Force the Lua eval to always report a version mismatch (return 0)
			const originalEval = mockRedis.eval;
			mockRedis.eval = () => Promise.resolve(0);

			try {
				await expect(() => s.update('c4', r => r))
					.rejects.toThrow('could not be updated after 0 retries');
			}
			finally {
				mockRedis.eval = originalEval;
			}
		});
	});

	describe('updateEnforcingNew', () => {

		it('creates a new record when id does not exist', async () => {
			await storage.updateEnforcingNew('d1', () => ({ name: 'Created', value: 1 }));
			expect(await storage.get('d1')).toEqual({ name: 'Created', value: 1 });
		});

		it('updates when record already exists', async () => {
			await storage.create('d2', { name: 'Existing', value: 10 });
			await storage.updateEnforcingNew('d2', r => ({ ...r!, value: 20 }));
			expect(await storage.get('d2')).toEqual({ name: 'Existing', value: 20 });
		});

		it('calls callback with undefined when creating', async () => {
			let receivedArg: Item | undefined = { name: 'should-not-be-this', value: -1 };
			await storage.updateEnforcingNew('d3', r => {
				receivedArg = r;
				return { name: 'new', value: 0 };
			});
			expect(receivedArg).toBeUndefined();
		});

		it('calls callback with existing data when updating', async () => {
			await storage.create('d4', { name: 'Old', value: 5 });
			let receivedArg: Item | undefined;
			await storage.updateEnforcingNew('d4', r => {
				receivedArg = r;
				return { name: 'Updated', value: 6 };
			});
			expect(receivedArg).toEqual({ name: 'Old', value: 5 });
		});

		it('is safe under same-process concurrency', async () => {
			const id = 'concurrent-upsert';
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

			const envelope = JSON.parse(mockRedis.store.get(`test_items:${id}`)!);
			expect(envelope.v).toBe(concurrency);
		});
	});

	describe('delete', () => {

		it('deletes an existing record and returns true', async () => {
			await storage.create('e1', { name: 'ToDelete', value: 0 });
			expect(await storage.delete('e1')).toBe(true);
			expect(await storage.get('e1')).toBeUndefined();
		});

		it('returns false when deleting a non-existent record', async () => {
			expect(await storage.delete('no-such-record')).toBe(false);
		});

		it('throws on non-string id', async () => {
			await expect(() => storage.delete('' as string))
				.rejects.toThrow('id must be a non-empty String');
		});
	});
});
