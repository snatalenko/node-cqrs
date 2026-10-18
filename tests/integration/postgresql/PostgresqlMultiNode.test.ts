/**
 * Integration test of application instances sharing a PostgreSQL event store, each with in-memory views.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 */
import { Pool } from 'pg';
import {
	AbstractProjection,
	AbstractSaga,
	ContainerBuilder,
	InMemoryView,
	type IContainer,
	type IEvent
} from '../../../src/index.ts';
import { PostgresqlEventStorage } from '../../../src/postgresql/index.ts';

const CONNECTION_STRING = process.env.DATABASE_URL ??
	process.env.POSTGRESQL_CONNECTION_STRING ??
	'postgres://postgres:postgres@localhost:5432/postgres';

const EVENTS_TABLE = 'int_pg_multi_node_events';
const EVENT_SAGAS_TABLE = 'int_pg_multi_node_event_sagas';

interface NodeContainer extends IContainer {
	usersView: InMemoryView<{ name: string }>;
}

class UsersProjection extends AbstractProjection<InMemoryView<{ name: string }>> {
	userCreated({ aggregateId, payload }: IEvent<{ name: string }>) {
		this.view.create(aggregateId!, payload!);
	}
}

class WelcomeSaga extends AbstractSaga {
	static get startsWith() {
		return ['userCreated'];
	}

	userCreated(event: IEvent) {
		this.enqueue('sendWelcomeEmail', event.aggregateId, {});
	}
}

async function waitUntil(condition: () => Promise<boolean> | boolean, timeout = 5_000) {
	const deadline = Date.now() + timeout;
	while (!await condition()) {
		if (Date.now() > deadline)
			throw new Error('Timed out waiting for condition');
		await new Promise(resolve => setTimeout(resolve, 20));
	}
}

describe('Application instances sharing a PostgreSQL event store (integration)', () => {

	let pool: Pool;
	const containers: NodeContainer[] = [];
	let welcomeEmails: string[];

	function createNode() {
		const builder = new ContainerBuilder<NodeContainer>();
		builder.registerInstance(pool, 'eventStoragePostgresqlDb');
		builder.registerInstance({
			eventsTableName: EVENTS_TABLE,
			eventSagasTableName: EVENT_SAGAS_TABLE
		}, 'postgresqlEventStorageConfig');
		builder.registerInstance({ pollInterval: 50 }, 'postgresqlEventFeedConfig');
		builder.registerEventFeed(PostgresqlEventStorage).as('eventStorage').as('identifierProvider');
		builder.registerProjection(UsersProjection, 'usersView');
		builder.registerSaga(WelcomeSaga);

		const container = builder.container();
		container.commandBus.on('sendWelcomeEmail', command => {
			welcomeEmails.push(String(command.aggregateId));
		});
		containers.push(container);
		return container;
	}

	async function dropTables() {
		await pool.query(`DROP TABLE IF EXISTS ${EVENT_SAGAS_TABLE}`);
		await pool.query(`DROP TABLE IF EXISTS ${EVENTS_TABLE}`);
	}

	beforeAll(async () => {
		pool = new Pool({ connectionString: CONNECTION_STRING });
		await pool.query('SELECT 1');
	});

	afterAll(async () => {
		await pool.end();
	});

	beforeEach(async () => {
		welcomeEmails = [];
		await dropTables();
	});

	afterEach(async () => {
		for (const container of containers.splice(0)) {
			for (const feed of container.eventFeeds ?? [])
				await feed.stopEventFeed();
			await container.eventStore.drain();
		}
		await dropTables();
	});

	it('keeps in-memory views of each instance in sync and runs sagas once', async () => {
		const nodeA = createNode();
		const nodeB = createNode();

		const { usersView: viewA } = nodeA;
		const { usersView: viewB } = nodeB;
		await Promise.all([...nodeA.restorePromises!, ...nodeB.restorePromises!]);

		await nodeA.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }]);
		await nodeB.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'bob', payload: { name: 'Bob' } }]);

		await waitUntil(async () => !!await viewA.get('bob') && !!await viewB.get('alice'));

		expect(await viewA.get('alice')).toEqual({ name: 'Alice' });
		expect(await viewA.get('bob')).toEqual({ name: 'Bob' });
		expect(await viewB.get('alice')).toEqual({ name: 'Alice' });
		expect(await viewB.get('bob')).toEqual({ name: 'Bob' });

		await new Promise(resolve => setTimeout(resolve, 200));
		expect(welcomeEmails.sort()).toEqual(['alice', 'bob']);
	});

	it('restores a new instance from the store and keeps it in sync', async () => {
		const nodeA = createNode();
		const { usersView: viewA } = nodeA;
		await Promise.all(nodeA.restorePromises!);
		await nodeA.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }]);

		const nodeB = createNode();
		const { usersView: viewB } = nodeB;
		await Promise.all(nodeB.restorePromises!);
		await nodeA.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'bob', payload: { name: 'Bob' } }]);

		await waitUntil(async () => !!await viewB.get('bob'));

		expect(await viewB.get('alice')).toEqual({ name: 'Alice' });
		expect(await viewA.get('bob')).toEqual({ name: 'Bob' });
		expect(welcomeEmails.sort()).toEqual(['alice', 'bob']);
	});
});
