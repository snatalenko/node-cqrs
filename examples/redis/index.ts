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
import { type IContainer, ContainerBuilder, InMemoryEventStorage } from '../../src/index.ts'; // 'node-cqrs'
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

	userCreated(event: UserCreatedEvent) {
		return this.view.updateEnforcingNew(event.aggregateId!, () => ({
			username: event.payload!.username
		}));
	}

	userRenamed(event: UserRenamedEvent) {
		return this.view.updateEnforcingNew(event.aggregateId!, r => ({
			username: event.payload!.username ?? r!.username
		}));
	}
}

// --- Wire up ---

interface MyContainer extends IContainer {
	viewModelRedisFactory: () => Promise<Redis>;
	usersView: RedisView<UserRecord>;
}

class RedisConnectionError extends Error {}

const builder = new ContainerBuilder<MyContainer>();
builder.register(() => {
	let connection: Promise<Redis> | undefined;
	return async () => {
		connection ??= (async () => {
			// Credentials can be loaded from async storage here.
			const client = new Redis('redis://localhost:6379', {
				lazyConnect: true,
				connectTimeout: 2000,
				retryStrategy: () => null
			});

			// Report connection failures through the factory promise.
			client.on('error', () => {});
			try {
				await client.connect();
				return client;
			}
			catch (err) {
				client.disconnect();
				throw new RedisConnectionError('Redis is unavailable at localhost:6379.', { cause: err });
			}
		})();
		return connection;
	};
}).as('viewModelRedisFactory');
builder.register(InMemoryEventStorage);
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const { commandBus, usersView, eventStore, viewModelRedisFactory } = container;

// --- Run ---

try {
	await Promise.all(container.restorePromises ?? []);

	const [userCreated] = await commandBus.send('createUser', undefined, {
		payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
	});

	await eventStore.drain();
	const user = await usersView.get(userCreated.aggregateId as string);
	console.log('User stored in Redis:', user); // { username: 'alice' }
}
catch (err) {
	if (!(err instanceof RedisConnectionError))
		throw err;

	console.warn('Skipping Redis example:', err.message);
}
finally {
	await viewModelRedisFactory().then(client => client.disconnect(), () => {});
}
