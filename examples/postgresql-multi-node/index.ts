/**
 * PostgreSQL multi-instance example: two application instances share one PostgreSQL event store,
 * each keeping an in-memory users view. The event storage acts as an event feed,
 * delivering events committed by one instance to the other.
 *
 * Both instances run in this process for brevity; in production each one is a separate process.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 *
 * Run with the default local connection:
 *   npm run example:postgresql-multi-node
 */
import { Client, Pool } from 'pg';
import { AbstractProjection, ContainerBuilder, InMemoryView, type IContainer } from '../../src/index.ts';
import { PostgresqlEventStorage } from '../../src/postgresql/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type {
	CreateUserCommandPayload,
	UserCreatedEvent,
	UserRecord
} from '../user-domain-ts/messages.ts';

const EVENTS_TABLE = 'example_pg_multi_events';
const EVENT_SAGAS_TABLE = 'example_pg_multi_event_sagas';

class UsersProjection extends AbstractProjection<InMemoryView<UserRecord>> {
	userCreated(event: UserCreatedEvent) {
		this.view.create(event.aggregateId!, { username: event.payload!.username });
	}
}

interface InstanceContainer extends IContainer {
	usersView: InMemoryView<UserRecord>;
}

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString });
await pool.query('SELECT 1');

async function dropExampleTables() {
	await pool.query(`DROP TABLE IF EXISTS ${EVENT_SAGAS_TABLE}`);
	await pool.query(`DROP TABLE IF EXISTS ${EVENTS_TABLE}`);
}

function createInstance() {
	const builder = new ContainerBuilder<InstanceContainer>();

	builder.registerInstance(pool, 'eventStoragePostgresqlDb');
	builder.registerInstance({
		eventsTableName: EVENTS_TABLE,
		eventSagasTableName: EVENT_SAGAS_TABLE
	}, 'postgresqlEventStorageConfig');

	// A dedicated connection receives notifications about events committed by other instances.
	// Without it, the feed polls the events table every `postgresqlEventFeedConfig.pollInterval` milliseconds.
	builder.registerInstance(async () => {
		const client = new Client({ connectionString });
		await client.connect();
		return client;
	}, 'eventStoragePostgresqlListenerFactory');

	// The event storage also acts as an event feed, dispatching events committed by other instances
	builder.registerEventFeed(PostgresqlEventStorage).as('eventStorage').as('identifierProvider');

	builder.registerAggregate(UserAggregate);
	builder.registerProjection(UsersProjection, 'usersView');

	return builder.container();
}

/** Waits until the user appears in the view */
async function waitForUser(view: InMemoryView<UserRecord>, userId: string) {
	for (let attempt = 0; attempt < 100 && !view.has(userId); attempt++)
		await new Promise(resolve => setTimeout(resolve, 20));

	return view.get(userId);
}

const instances: InstanceContainer[] = [];
try {
	await dropExampleTables();

	const instanceA = createInstance();
	const instanceB = createInstance();
	instances.push(instanceA, instanceB);

	const { usersView: usersViewA } = instanceA;
	const { usersView: usersViewB } = instanceB;
	await Promise.all([...instanceA.restorePromises!, ...instanceB.restorePromises!]);

	const [userCreated] = await instanceA.commandBus.send('createUser', undefined, {
		payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
	});
	const userId = String(userCreated.aggregateId);

	console.log('Instance A view:', await waitForUser(usersViewA, userId)); // { username: 'alice' }
	console.log('Instance B view:', await waitForUser(usersViewB, userId)); // { username: 'alice' }
}
finally {
	for (const instance of instances) {
		for (const feed of instance.eventFeeds ?? [])
			await feed.stopEventFeed();
		await instance.eventStore.drain();
	}
	await dropExampleTables();
	await pool.end();
}
