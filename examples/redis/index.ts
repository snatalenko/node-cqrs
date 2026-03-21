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
import {
	type IContainer,
	type IEvent,
	AbstractAggregate,
	ContainerBuilder,
	EventIdAugmentor,
	InMemoryEventStorage
} from 'node-cqrs';
import { AbstractRedisProjection, type RedisView } from 'node-cqrs/redis';

// ── Domain ────────────────────────────────────────────────────────────────────

class UserAggregate extends AbstractAggregate {
	createUser({ username }: { username: string }) {
		this.emit('userCreated', { username });
	}
}

type UserRecord = { username: string };

class UsersProjection extends AbstractRedisProjection<UserRecord> {

	static override get tableName() {
		return 'users';
	}

	static override get schemaVersion() {
		return '1';
	}

	userCreated(event: IEvent<UserRecord>) {
		this.view.updateEnforcingNew(event.aggregateId as string, () => ({
			username: event.payload!.username
		}));
	}
}

// ── Wire up ───────────────────────────────────────────────────────────────────

interface MyContainer extends IContainer {
	viewModelRedis: Redis;
	usersView: RedisView<UserRecord>;
}

const builder = new ContainerBuilder<MyContainer>();
builder.register(() => new Redis({ host: 'localhost', port: 6379 })).as('viewModelRedis');
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter'); // stamps event.id — required for IEventLocker checkpoints
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const { commandBus, usersView } = container;

// ── Run ───────────────────────────────────────────────────────────────────────

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'alice' }
});

const user = await usersView.get(userCreated.aggregateId as string);
console.log('User stored in Redis:', user); // { username: 'alice' }

await container.viewModelRedis.quit();
