/**
 * MongoDB views example: persistent users projection backed by MongoDB.
 *
 * Requires a running MongoDB instance:
 *   docker run -d -p 27017:27017 mongo:7
 *
 * Run with Node.js 22+:
 *   node examples/mongodb-views/index.ts
 */
import { MongoClient } from 'mongodb';
import { type IContainer, ContainerBuilder, EventIdAugmentor, InMemoryEventStorage } from 'node-cqrs';
import { AbstractMongoObjectProjection, type MongoObjectView } from 'node-cqrs/mongodb';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload, RenameUserCommandPayload, UserCreatedEvent, UserRecord, UserRenamedEvent } from '../user-domain-ts/messages.ts';

// --- Projection (MongoDB-backed view) ---

class UsersProjection extends AbstractMongoObjectProjection<UserRecord> {

	static override get tableName() {
		return 'users';
	}

	static override get schemaVersion() {
		return '1';
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.create(event.aggregateId!, {
			username: event.payload!.username
		});
	}

	async userRenamed(event: UserRenamedEvent) {
		await this.view.updateEnforcingNew(event.aggregateId!, r => ({
			...r!,
			username: event.payload!.username
		}));
	}
}

// --- Setup ---

interface MyContainer extends IContainer {
	usersView: MongoObjectView<UserRecord>;
}

const builder = new ContainerBuilder<MyContainer>();

builder.register(() => {
	let client: MongoClient;
	return async () => {
		if (!client) {
			client = new MongoClient('mongodb://localhost:27017');
			await client.connect();
		}
		return client.db('node_cqrs_views_example');
	};
}).as('viewModelMongoDbFactory');
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter'); // stamps event.id — required for IEventLocker checkpoints
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const { commandBus, usersView, eventStore, viewModelMongoDbFactory } = container;

// --- Run ---

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
});

const userId = userCreated.aggregateId;

await eventStore.drain();
console.log('Created user:', await usersView.get(userId)); // { username: 'alice' }


await commandBus.send('renameUser', userId, {
	payload: { username: 'alice-smith' } satisfies RenameUserCommandPayload
});

await eventStore.drain();
console.log('Renamed user:', await usersView.get(userId)); // { username: 'alice-smith' }

// --- Cleanup ---

const db = await viewModelMongoDbFactory!();
await db.dropDatabase();
await db.client.close();
