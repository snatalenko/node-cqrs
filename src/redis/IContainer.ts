import type { Redis } from 'ioredis';

declare module 'node-cqrs' {
	interface IContainer {
		viewModelRedisFactory?: () => Promise<Redis> | Redis;
		viewModelRedis?: Redis;
	}
}
