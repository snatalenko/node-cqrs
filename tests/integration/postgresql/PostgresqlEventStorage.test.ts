/**
 * Integration tests for PostgreSQL-backed event storage.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 *
 * Optional connection override:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:postgresql
 */
import { Pool } from 'pg';
import { ConcurrencyError } from '../../../src/index.ts';
import { PostgresqlEventStorage } from '../../../src/postgresql/index.ts';

const CONNECTION_STRING = process.env.DATABASE_URL ??
	process.env.POSTGRESQL_CONNECTION_STRING ??
	'postgres://postgres:postgres@localhost:5432/postgres';

const EVENTS_TABLE = 'int_pg_events';
const EVENT_SAGAS_TABLE = 'int_pg_event_sagas';

describe('PostgresqlEventStorage (integration)', () => {
	let pool: Pool;
	let storage: PostgresqlEventStorage;

	beforeAll(async () => {
		pool = new Pool({ connectionString: CONNECTION_STRING });
		await pool.query('SELECT 1');
	});

	afterAll(async () => {
		await pool.end();
	});

	async function dropIntegrationTables() {
		await pool.query(`DROP TABLE IF EXISTS ${EVENT_SAGAS_TABLE}`);
		await pool.query(`DROP TABLE IF EXISTS ${EVENTS_TABLE}`);
	}

	beforeEach(async () => {
		await dropIntegrationTables();
		storage = new PostgresqlEventStorage({
			viewModelPostgresqlDb: pool,
			postgresqlEventStorageConfig: {
				eventsTableName: EVENTS_TABLE,
				eventSagasTableName: EVENT_SAGAS_TABLE
			}
		});
	});

	afterEach(async () => {
		await dropIntegrationTables();
	});

	it('persists events and restores aggregate, saga, and type streams', async () => {
		const aggregateId = storage.getNewId();
		const originEvent = { id: storage.getNewId(), type: 'SagaStarted' };
		const created = { id: storage.getNewId(), type: 'Created', aggregateId, aggregateVersion: 1 };
		const updated = {
			id: storage.getNewId(),
			type: 'Updated',
			aggregateId,
			aggregateVersion: 2,
			sagaOrigins: { SagaA: originEvent.id! }
		};
		const finished = {
			id: storage.getNewId(),
			type: 'Finished',
			sagaOrigins: { SagaA: originEvent.id! }
		};

		await storage.commitEvents([originEvent, created, updated, finished]);

		const aggregateEvents = [];
		for await (const event of storage.getAggregateEvents(aggregateId, { eventTypes: ['Created'], tail: 'last' }))
			aggregateEvents.push(event);
		expect(aggregateEvents).toEqual([created, updated]);

		const sagaEvents = [];
		for await (const event of storage.getSagaEvents(`SagaA:${originEvent.id}`, { beforeEvent: finished }))
			sagaEvents.push(event);
		expect(sagaEvents).toEqual([originEvent, updated]);

		const updatedEvents = [];
		for await (const event of storage.getEventsByTypes(['Updated']))
			updatedEvents.push(event);
		expect(updatedEvents).toEqual([updated]);
	});

	it('rolls back the batch when an event conflicts', async () => {
		const aggregateId = storage.getNewId();
		const otherAggregateId = storage.getNewId();

		await storage.commitEvents([
			{ id: storage.getNewId(), type: 'Existing', aggregateId, aggregateVersion: 1 }
		]);

		await expect(storage.commitEvents([
			{ id: storage.getNewId(), type: 'InsertedThenRolledBack', aggregateId: otherAggregateId, aggregateVersion: 1 },
			{ id: storage.getNewId(), type: 'Conflicting', aggregateId, aggregateVersion: 1 }
		])).rejects.toBeInstanceOf(ConcurrencyError);

		const rolledBack = [];
		for await (const event of storage.getAggregateEvents(otherAggregateId))
			rolledBack.push(event);
		expect(rolledBack).toEqual([]);
	});

	it('allows duplicate aggregate versions when ignoreConcurrencyError is enabled', async () => {
		const aggregateId = storage.getNewId();
		await storage.commitEvents([
			{ id: storage.getNewId(), type: 'Created', aggregateId, aggregateVersion: 1 }
		]);

		await storage.commitEvents([
			{ id: storage.getNewId(), type: 'Duplicate', aggregateId, aggregateVersion: 1 }
		], { ignoreConcurrencyError: true });

		const events = [];
		for await (const event of storage.getAggregateEvents(aggregateId))
			events.push(event);
		expect(events.map(event => event.type)).toEqual(['Created', 'Duplicate']);
	});

	it('prevents concurrent duplicate aggregate versions across instances', async () => {
		const first = new PostgresqlEventStorage({
			viewModelPostgresqlDb: pool,
			postgresqlEventStorageConfig: {
				eventsTableName: EVENTS_TABLE,
				eventSagasTableName: EVENT_SAGAS_TABLE
			}
		});
		const second = new PostgresqlEventStorage({
			viewModelPostgresqlDb: pool,
			postgresqlEventStorageConfig: {
				eventsTableName: EVENTS_TABLE,
				eventSagasTableName: EVENT_SAGAS_TABLE
			}
		});
		const aggregateId = storage.getNewId();

		await first.assertConnection();
		await second.assertConnection();

		const results = await Promise.allSettled([
			first.commitEvents([{ id: storage.getNewId(), type: 'CreatedByFirst', aggregateId, aggregateVersion: 1 }]),
			second.commitEvents([{ id: storage.getNewId(), type: 'CreatedBySecond', aggregateId, aggregateVersion: 1 }])
		]);

		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find(result => result.status === 'rejected');
		expect(rejected?.status).toBe('rejected');
		expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyError);

		const events = [];
		for await (const event of storage.getAggregateEvents(aggregateId))
			events.push(event);
		expect(events).toHaveLength(1);
	});
});
