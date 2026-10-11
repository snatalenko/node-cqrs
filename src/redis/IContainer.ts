import type { Redis } from 'ioredis';
import type { RedisProjectionDbFactoryParams } from './RedisProjectionDataParams.ts';

declare module 'node-cqrs' {
	interface IContainer {
		viewModelRedisFactory?: (params?: RedisProjectionDbFactoryParams) => Promise<Redis> | Redis;
		viewModelRedis?: Redis;
	}
}
