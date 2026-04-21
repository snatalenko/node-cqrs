import type { Redis } from 'ioredis';
import { AbstractRedisAccessor } from '../../../src/redis/index.ts';
import { createMockRedis } from './mockRedis.ts';

describe('AbstractRedisAccessor', () => {
	it('initializes only once for concurrent assertConnection() calls', async () => {
		const mockRedis = createMockRedis();

		let releaseInitialize!: () => void;
		const initializeGate = new Promise<void>(resolve => {
			releaseInitialize = resolve;
		});

		let factoryCalls = 0;
		let initializeCalls = 0;

		class TestAccessor extends AbstractRedisAccessor {
			protected override async initialize(_redis: Redis): Promise<void> {
				initializeCalls += 1;
				await initializeGate;
			}
		}

		const accessor = new TestAccessor({
			viewModelRedisFactory: () => {
				factoryCalls += 1;
				return mockRedis as unknown as Redis;
			}
		});

		const first = accessor.assertConnection();
		const second = accessor.assertConnection();

		await Promise.resolve();
		releaseInitialize();

		await Promise.all([first, second]);

		expect(factoryCalls).toBe(1);
		expect(initializeCalls).toBe(1);
	});
});
