/**
 * MongoDB views example: persistent users projection backed by MongoDB.
 *
 * Requires a running MongoDB instance:
 *   docker run -d -p 27017:27017 mongo:7
 *
 * Run with Node.js 22+:
 *   node examples/mongodb-views/index.ts
 */
import { type Db, MongoClient, MongoServerSelectionError } from 'mongodb';
import { type IContainer, ContainerBuilder, InMemoryEventStorage } from '../../src/index.ts'; // 'node-cqrs';
import { AbstractMongoObjectProjection, type MongoObjectView } from '../../src/mongodb/index.ts'; // 'node-cqrs/mongodb';
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
	viewModelMongoDbFactory: () => Promise<Db>;
}

const builder = new ContainerBuilder<MyContainer>();

builder.register(() => {
	let connection: Promise<MongoClient> | undefined;
	return async () => {
		connection ??= (async () => {
			// Credentials can be loaded from async storage here.
			const client = new MongoClient('mongodb://localhost:27017', {
				serverSelectionTimeoutMS: 2000
			});
			try {
				return await client.connect();
			}
			catch (err) {
				await client.close();
				throw err;
			}
		})();
		const client = await connection;
		return client.db('node_cqrs_views_example');
	};
}).as('viewModelMongoDbFactory');
builder.register(InMemoryEventStorage);
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const { commandBus, usersView, eventStore, viewModelMongoDbFactory } = container;

// --- Run ---

try {
	await Promise.all(container.restorePromises ?? []);

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
}
catch (err) {
	if (!(err instanceof MongoServerSelectionError))
		throw err;

	console.warn('Skipping MongoDB views example: MongoDB is unavailable at localhost:27017.');
}
finally {
	await Promise.resolve(viewModelMongoDbFactory!()).then(db => db.client.close(), () => {});
}
