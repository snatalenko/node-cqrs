/**
 * MongoDB event storage example.
 *
 * Requires a running MongoDB instance:
 *   docker run -d -p 27017:27017 mongo:7
 *
 * Run with Node.js 22+:
 *   node examples/mongodb-eventstore/index.ts
 */
import { MongoClient, MongoServerSelectionError } from 'mongodb';
import { type IContainer, ContainerBuilder } from 'node-cqrs';
import { MongoEventStorage } from 'node-cqrs/mongodb';
import type { CreateUserCommandPayload, RenameUserCommandPayload } from '../user-domain-ts/messages.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import { UsersProjection, type UsersView } from '../user-domain-ts/UsersProjection.ts';

// --- Setup ---


interface MyContainer extends IContainer {
	users: UsersView;
}

const builder = new ContainerBuilder<MyContainer>();

// Register the Db factory - DI resolves it by name for MongoEventStorage
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
		return client.db('node_cqrs_eventstore_example');
	};
}).as('eventStorageMongoDbFactory');

// MongoEventStorage is auto-resolved as eventStorageReader, eventStorage, and identifierProvider
builder.register(MongoEventStorage);
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'users');

const { commandBus, users, eventStore, eventStorageMongoDbFactory } = builder.container();

// --- Run ---

try {
	// 1. Create a new user — MongoDB stores the first event for this aggregate
	const [userCreated] = await commandBus.send('createUser', undefined, {
		payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
	});

	const aggregateId = userCreated.aggregateId;
	console.log('Created user:', users.get(aggregateId)); // { username: 'alice' }

	// 2. Rename the same user — aggregate state is restored from MongoDB before the command runs
	await commandBus.send('renameUser', aggregateId, {
		payload: { username: 'alice-smith' } satisfies RenameUserCommandPayload
	});

	console.log('Renamed user:', users.get(aggregateId)); // { username: 'alice-smith' }

	// 3. Sending the same rename again hits the business-rule guard (state is still restored)
	await commandBus.send('renameUser', aggregateId, {
		payload: { username: 'alice-smith' } satisfies RenameUserCommandPayload
	}).catch(err => console.log('Expected error:', err.message)); // Username is already 'alice-smith'

	// --- Cleanup ---

	await eventStore.drain();
	const db = await eventStorageMongoDbFactory!();
	await db.dropDatabase();
}
catch (err) {
	if (!(err instanceof MongoServerSelectionError))
		throw err;

	console.warn('Skipping MongoDB event storage example: MongoDB is unavailable at localhost:27017.');
}
finally {
	await Promise.resolve(eventStorageMongoDbFactory!()).then(db => db.client.close(), () => {});
}
