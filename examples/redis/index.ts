/**
 * Redis example: persistent users projection backed by Redis.
 *
 * Prerequisites:
 *   docker run -d -p 6379:6379 redis:7-alpine
 *
 * Run (Node 24+):
 *   node examples/redis/index.ts
 */

import { Redis } from 'ioredis';
import { type IContainer, ContainerBuilder, EventIdAugmentor, InMemoryEventStorage } from '../../src/index.ts'; // 'node-cqrs'
import { AbstractRedisProjection, type RedisView } from '../../src/redis/index.ts'; // 'node-cqrs/redis'
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload, UserCreatedEvent, UserRecord, UserRenamedEvent } from '../user-domain-ts/messages.ts';

class UsersProjection extends AbstractRedisProjection<UserRecord> {

	static override get tableName() {
		return 'users';
	}

	static override get schemaVersion() {
		return '1';
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.updateEnforcingNew(event.aggregateId!, () => ({
			username: event.payload!.username
		}));
	}

	async userRenamed(event: UserRenamedEvent) {
		await this.view.updateEnforcingNew(event.aggregateId!, r => ({
			username: event.payload!.username ?? r!.username
		}));
	}
}

// --- Wire up ---

interface MyContainer extends IContainer {
	viewModelRedis: Redis;
	usersView: RedisView<UserRecord>;
}

const builder = new ContainerBuilder<MyContainer>();
const redis = new Redis({ host: 'localhost', port: 6379 });
builder.registerInstance(redis, 'viewModelRedis');
builder.register(InMemoryEventStorage);

// Event ids are required for projection checkpoints.
builder.register(EventIdAugmentor).as('eventIdAugmenter');
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const { commandBus, usersView, eventStore } = container;

// --- Run ---

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
});

await eventStore.drain();
const user = await usersView.get(userCreated.aggregateId!);
console.log('User stored in Redis:', user); // { username: 'alice' }

await redis.quit();
