import type { Redis } from 'ioredis';
import { AbstractRedisProjection, RedisView } from '../../../src/redis/index.ts';
import { createMockRedisForView } from './mockRedisForView.ts';

describe('AbstractRedisProjection', () => {
	it('throws when static tableName or schemaVersion are not defined', () => {
		class MissingRedisProjection extends AbstractRedisProjection<any> {
			somethingHappened() { }
		}

		expect(() => MissingRedisProjection.tableName).toThrow('tableName is not defined');
		expect(() => MissingRedisProjection.schemaVersion).toThrow('schemaVersion is not defined');
	});

	it('initializes RedisView in constructor', async () => {
		class UsersProjection extends AbstractRedisProjection<{ name: string }> {
			static get tableName(): string {
				return 'users';
			}

			static get schemaVersion(): string {
				return '1';
			}

			userCreated() { }
		}

		const mockRedis = createMockRedisForView();
		const projection = new UsersProjection({
			viewModelRedis: mockRedis as unknown as Redis
		});

		expect(projection.view).toBeInstanceOf(RedisView);

		await projection.view.create('1', { name: 'Alice' });
		expect(await projection.view.get('1')).toEqual({ name: 'Alice' });
	});
});
