/**
 * Integration tests for the PostgreSQL event storage acting as an event feed.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 *
 * The feed waits for every open transaction in the cluster, so transactions of tests running in parallel
 * delay its delivery; `npm run test:postgresql` runs test files serially.
 */
import { Client, Pool } from 'pg';
import type { IEvent } from '../../../src/index.ts';
import { PostgresqlEventStorage } from '../../../src/postgresql/index.ts';

const CONNECTION_STRING = process.env.DATABASE_URL ??
	process.env.POSTGRESQL_CONNECTION_STRING ??
	'postgres://postgres:postgres@localhost:5432/postgres';

const EVENTS_TABLE = 'int_pg_feed_events';
const EVENT_SAGAS_TABLE = 'int_pg_feed_event_sagas';

type Delivery = { events: IEvent[], meta?: Record<string, any> };

/** Waits until the condition holds, checking it every 20 ms */
async function waitUntil(condition: () => boolean, timeout = 3_000) {
	const deadline = Date.now() + timeout;
	while (!condition()) {
		if (Date.now() > deadline)
			throw new Error('Timed out waiting for condition');
		await new Promise(resolve => setTimeout(resolve, 20));
	}
}

describe('PostgresqlEventStorage event feed (integration)', () => {

	let pool: Pool;
	const storages: PostgresqlEventStorage[] = [];
	const listeners: Client[] = [];

	const deliveriesOf = new WeakMap<PostgresqlEventStorage, Delivery[]>();

	function createStorage(options?: {
		pollInterval?: number,
		listen?: boolean,
		db?: any
	}) {
		// records events the feed dispatches, standing in for the container's event dispatcher
		const deliveries: Delivery[] = [];
		const eventDispatcher = {
			dispatch: async (events: IEvent[], meta?: Record<string, any>) => {
				deliveries.push({ events: [...events], meta });
				return events;
			}
		};

		const storage = new PostgresqlEventStorage({
			get: (alias: string | symbol) => (alias === 'eventDispatcher' ? eventDispatcher : undefined) as object,
			eventStoragePostgresqlDb: options?.db ?? pool,
			postgresqlEventStorageConfig: {
				eventsTableName: EVENTS_TABLE,
				eventSagasTableName: EVENT_SAGAS_TABLE
			},
			postgresqlEventFeedConfig: {
				pollInterval: options?.pollInterval ?? 60_000
			},
			eventStoragePostgresqlListenerFactory: options?.listen ?
				async () => {
					const client = new Client({ connectionString: CONNECTION_STRING });
					client.on('error', () => { });
					listeners.push(client);
					await client.connect();
					return client;
				} :
				undefined
		});
		storages.push(storage);
		deliveriesOf.set(storage, deliveries);
		return storage;
	}

	async function startFeed(storage: PostgresqlEventStorage) {
		await storage.startEventFeed();
		return deliveriesOf.get(storage)!;
	}

	const deliveredIds = (deliveries: Delivery[]) => deliveries.flatMap(d => d.events.map(e => e.id));

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
		await dropTables();
	});

	afterEach(async () => {
		await Promise.all(storages.splice(0).map(s => s.stopEventFeed()));
		await Promise.all(listeners.splice(0).map(c => c.end().catch(() => { })));
		await dropTables();
	});

	it('delivers committed events of other instances, skipping own and historical ones', async () => {
		const historical = createStorage();
		await historical.commitEvents([{ id: 'historical', type: 'A' }]);

		const nodeA = createStorage({ pollInterval: 50 });
		const nodeB = createStorage();
		const deliveries = await startFeed(nodeA);

		await nodeA.commitEvents([{ id: 'own', type: 'A' }]);
		await nodeB.process([
			{ event: { id: 'remote-1', type: 'A' }, origin: 'internal', custom: 'value' },
			{ event: { id: 'remote-2', type: 'B' }, origin: 'internal', custom: 'value' }
		] as any);
		await nodeB.commitEvents([{ id: 'remote-3', type: 'C', sagaOrigins: { SagaA: 'remote-1' } }]);

		await waitUntil(() => deliveredIds(deliveries).length >= 3);
		await new Promise(resolve => setTimeout(resolve, 150));

		expect(deliveredIds(deliveries)).toEqual(['remote-1', 'remote-2', 'remote-3']);
		expect(deliveries[0]).toEqual({
			events: [{ id: 'remote-1', type: 'A' }, { id: 'remote-2', type: 'B' }],
			meta: { origin: 'external', custom: 'value' }
		});
		expect(deliveries[1].events).toEqual([{ id: 'remote-3', type: 'C', sagaOrigins: { SagaA: 'remote-1' } }]);
	});

	it('delivers events of a transaction open when the feed started, once it commits', async () => {
		const nodeA = createStorage({ pollInterval: 50 });
		await nodeA.assertConnection();

		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(`INSERT INTO ${EVENTS_TABLE} (id, type, data) VALUES ('open', 'A', '{"type":"A"}')`);

			const deliveries = await startFeed(nodeA);
			await client.query('COMMIT');

			await waitUntil(() => deliveredIds(deliveries).length >= 1);
			expect(deliveredIds(deliveries)).toEqual(['open']);
		}
		finally {
			client.release();
		}
	});

	it('waits for transactions that can still commit earlier-ordered events', async () => {
		const nodeA = createStorage({ pollInterval: 50 });
		const nodeB = createStorage();
		await nodeB.assertConnection();
		const deliveries = await startFeed(nodeA);

		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(`INSERT INTO ${EVENTS_TABLE} (id, type, data) VALUES ('earlier', 'A', '{"type":"A"}')`);
			await nodeB.commitEvents([{ id: 'later', type: 'A' }]);

			await new Promise(resolve => setTimeout(resolve, 200));
			expect(deliveredIds(deliveries)).toEqual([]);

			await client.query('COMMIT');
			await waitUntil(() => deliveredIds(deliveries).length >= 2);
			expect(deliveredIds(deliveries)).toEqual(['earlier', 'later']);
		}
		finally {
			client.release();
		}
	});

	it('does not query the events table for the feed unless started', async () => {
		const db = {
			query: jest.fn((text: string, values?: unknown[]) => pool.query(text, values as any[])),
			connect: () => pool.connect()
		};
		const storage = createStorage({ db });

		await storage.commitEvents([{ id: 'e1', type: 'A' }]);
		const read = [];
		for await (const event of storage.getEventsByTypes(['A']))
			read.push(event);
		expect(read).toHaveLength(1);

		const feedQueries = db.query.mock.calls.filter(([text]) => text.includes('pg_snapshot_xmin(pg_current_snapshot())::text'));
		expect(feedQueries).toEqual([]);
	});

	it('wakes up on notifications faster than the polling interval', async () => {
		const nodeA = createStorage({ listen: true, pollInterval: 60_000 });
		const nodeB = createStorage();
		await nodeB.assertConnection();
		const deliveries = await startFeed(nodeA);

		const committedAt = Date.now();
		await nodeB.commitEvents([{ id: 'notified', type: 'A' }]);

		await waitUntil(() => deliveredIds(deliveries).length >= 1, 2_000);
		expect(Date.now() - committedAt).toBeLessThan(2_000);
	});

	it('delivers events by polling after the listener connection is lost, and reconnects', async () => {
		const nodeA = createStorage({ listen: true, pollInterval: 200 });
		const nodeB = createStorage();
		await nodeB.assertConnection();
		const deliveries = await startFeed(nodeA);
		await waitUntil(() => listeners.length === 1);

		const [{ processID }] = listeners as any[];
		await pool.query('SELECT pg_terminate_backend($1)', [processID]);

		await nodeB.commitEvents([{ id: 'polled', type: 'A' }]);
		await waitUntil(() => deliveredIds(deliveries).length >= 1);

		await waitUntil(() => listeners.length === 2);
		await new Promise(resolve => setTimeout(resolve, 100));
		await nodeB.commitEvents([{ id: 'after-reconnect', type: 'A' }]);
		await waitUntil(() => deliveredIds(deliveries).length >= 2);

		expect(deliveredIds(deliveries)).toEqual(['polled', 'after-reconnect']);
	});

	it('stops delivering events once stopped', async () => {
		const nodeA = createStorage({ listen: true, pollInterval: 50 });
		const nodeB = createStorage();
		await nodeB.assertConnection();
		const deliveries = await startFeed(nodeA);

		await nodeA.stopEventFeed();
		await nodeB.commitEvents([{ id: 'after-stop', type: 'A' }]);
		await new Promise(resolve => setTimeout(resolve, 200));

		expect(deliveries).toEqual([]);
	});
});
