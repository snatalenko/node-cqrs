import type { Redis } from 'ioredis';
import { promisify } from 'util';
import { RedisView } from '../../../src/redis/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';
import { createMockRedisForView } from './mockRedisForView.ts';

const delay = promisify(setTimeout);

type Item = { name: string; value: number };

describe('RedisView', () => {
	let mockRedis: ReturnType<typeof createMockRedisForView>;
	let view: RedisView<Item>;

	beforeEach(() => {
		mockRedis = createMockRedisForView();
		view = new RedisView<Item>({
			viewModelRedis: mockRedis as unknown as Redis,
			projectionName: 'test',
			tableNamePrefix: 'items',
			schemaVersion: '1'
		});
	});

	it('creates a client from viewModelRedisFactory when direct client is not provided', async () => {
		let factoryCalled = false;
		const factoryView = new RedisView<Item>({
			viewModelRedisFactory: () => {
				factoryCalled = true;
				return mockRedis as unknown as Redis;
			},
			projectionName: 'factory-test',
			tableNamePrefix: 'items',
			schemaVersion: '1'
		});

		await factoryView.assertConnection();
		expect(factoryCalled).toBe(true);
	});

	it('throws if neither redis nor redisFactory are provided', () => {
		expect(() => new RedisView<Item>({
			projectionName: 'test',
			tableNamePrefix: 'items',
			schemaVersion: '1'
		} as any)).toThrow('either viewModelRedis or viewModelRedisFactory argument required');
	});

	it('throws if tableNamePrefix is missing', () => {
		expect(() => new RedisView<Item>({
			viewModelRedis: mockRedis as unknown as Redis,
			projectionName: 'test',
			tableNamePrefix: '',
			schemaVersion: '1'
		})).toThrow('options.tableNamePrefix must be a non-empty String');
	});

	it('throws if schemaVersion is missing', () => {
		expect(() => new RedisView<Item>({
			viewModelRedis: mockRedis as unknown as Redis,
			projectionName: 'test',
			tableNamePrefix: 'items',
			schemaVersion: ''
		})).toThrow('options.schemaVersion must be a non-empty String');
	});

	describe('ready and locking', () => {
		it('is ready initially and after unlock', async () => {
			expect(view.ready).toBe(true);

			await view.lock();
			expect(view.ready).toBe(false);

			await view.unlock();
			expect(view.ready).toBe(true);
		});

		it('waits for readiness in get()', async () => {
			await view.lock();

			let resolved = false;
			const resultPromise = view.get('missing').then(() => {
				resolved = true;
			});

			await delay(5);
			expect(resolved).toBe(false);

			await view.unlock();
			await resultPromise;

			expect(resolved).toBe(true);
		});
	});

	describe('object storage methods', () => {
		it('creates, gets, updates and deletes records', async () => {
			await view.create('1', { name: 'Alice', value: 1 });
			expect(await view.get('1')).toEqual({ name: 'Alice', value: 1 });

			await view.update('1', r => ({ ...r, value: 2 }));
			expect(await view.get('1')).toEqual({ name: 'Alice', value: 2 });

			expect(await view.delete('1')).toBe(true);
			expect(await view.get('1')).toBeUndefined();
		});

		it('updateEnforcingNew creates and updates records', async () => {
			await view.updateEnforcingNew('1', r => ({
				name: r?.name ?? 'Alice',
				value: (r?.value ?? 0) + 1
			}));
			expect(await view.get('1')).toEqual({ name: 'Alice', value: 1 });

			await view.updateEnforcingNew('1', r => ({
				name: r!.name,
				value: r!.value + 1
			}));
			expect(await view.get('1')).toEqual({ name: 'Alice', value: 2 });
		});
	});

	describe('event locker methods', () => {
		const event: IEvent = { id: 'evt-1', type: 'somethingHappened', payload: {} };

		it('tracks projecting and projected events', async () => {
			expect(await view.tryMarkAsProjecting(event)).toBe(true);
			expect(await view.tryMarkAsProjecting(event)).toBe(false);

			await view.markAsProjected(event);
			expect(await view.tryMarkAsProjecting(event)).toBe(false);
		});

		it('stores and retrieves the last event', async () => {
			expect(await view.getLastEvent()).toBeUndefined();

			await view.markAsLastEvent(event);
			expect(await view.getLastEvent()).toEqual(event);
		});
	});
});
