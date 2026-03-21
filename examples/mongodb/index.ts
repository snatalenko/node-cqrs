/**
 * MongoDB event storage example.
 *
 * Requires a running MongoDB instance:
 *   docker run -d -p 27017:27017 mongo:7
 *
 * Run with Node.js 22+:
 *   npx tsx examples/mongodb/index.ts
 */
import { MongoClient } from 'mongodb';
import {
	type IContainer,
	type IEvent,
	AbstractAggregate,
	AbstractProjection,
	ContainerBuilder,
	EventIdAugmentor
} from 'node-cqrs';
import { MongoEventStorage } from 'node-cqrs/mongodb';

// ─── Domain ──────────────────────────────────────────────────────────────────

type CreateUserPayload = { username: string };
type RenameUserPayload = { username: string };

type UserCreatedEvent = IEvent<{ username: string }>;
type UserRenamedEvent = IEvent<{ username: string }>;

class UserAggregateState {
	username = '';

	userCreated(event: UserCreatedEvent) {
		this.username = event.payload!.username;
	}

	userRenamed(event: UserRenamedEvent) {
		this.username = event.payload!.username;
	}
}

class UserAggregate extends AbstractAggregate<UserAggregateState> {
	protected readonly state = new UserAggregateState();

	createUser({ username }: CreateUserPayload) {
		this.emit('userCreated', { username });
	}

	renameUser({ username }: RenameUserPayload) {
		if (username === this.state.username)
			throw new Error(`Username is already '${username}'`);

		this.emit('userRenamed', { username });
	}
}

type UsersView = Map<string, { username: string }>;

class UsersProjection extends AbstractProjection<UsersView> {
	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: UserCreatedEvent) {
		this.view.set(event.aggregateId as string, {
			username: event.payload!.username
		});
	}

	userRenamed(event: UserRenamedEvent) {
		this.view.set(event.aggregateId as string, {
			username: event.payload!.username
		});
	}
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING
	?? 'mongodb://localhost:27017/node_cqrs_example';

interface MyContainer extends IContainer {
	users: UsersView;
}

const client = new MongoClient(CONNECTION_STRING);

const builder = new ContainerBuilder<MyContainer>();

// Register the Db factory — DI resolves it by name for MongoEventStorage
builder.register(() => client.connect().then(() => client.db())).as('mongoDbFactory');

// MongoEventStorage is auto-resolved as eventStorageReader, eventStorage, and identifierProvider
builder.register(MongoEventStorage);

// EventIdAugmentor must be in the pipeline when using sagas (adds event.id)
builder.register(EventIdAugmentor).as('eventIdAugmenter');

builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'users');

const { commandBus, users } = builder.container();

// ─── Run ─────────────────────────────────────────────────────────────────────

// 1. Create a new user — MongoDB stores the first event for this aggregate
const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'alice' } satisfies CreateUserPayload
});

const aggregateId = userCreated.aggregateId as string;
console.log('Created user:', users.get(aggregateId)); // { username: 'alice' }

// 2. Rename the same user — aggregate state is restored from MongoDB before the command runs
await commandBus.send('renameUser', aggregateId, {
	payload: { username: 'alice-smith' } satisfies RenameUserPayload
});

console.log('Renamed user:', users.get(aggregateId)); // { username: 'alice-smith' }

// 3. Sending the same rename again hits the business-rule guard (state is still restored)
await commandBus.send('renameUser', aggregateId, {
	payload: { username: 'alice-smith' } satisfies RenameUserPayload
}).catch(err => console.log('Expected error:', err.message)); // Username is already 'alice-smith'

await client.close();
