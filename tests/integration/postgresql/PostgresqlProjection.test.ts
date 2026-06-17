/**
 * Integration tests for PostgreSQL-backed projection views.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 *
 * Optional connection override:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:postgresql
 */
import { Pool } from 'pg';
import { promisify } from 'util';
import type { IEvent } from '../../../src/interfaces/index.ts';
import {
	AbstractPostgresqlObjectProjection,
	PostgresqlObjectStorage,
	PostgresqlObjectView,
	PostgresqlViewLocker
} from '../../../src/postgresql/index.ts';

const delay = promisify(setTimeout);

const CONNECTION_STRING = process.env.DATABASE_URL ??
	process.env.POSTGRESQL_CONNECTION_STRING ??
	'postgres://postgres:postgres@localhost:5432/postgres';

const EVENT_LOCK_TABLE = 'int_pg_event_locks';
const VIEW_LOCK_TABLE = 'int_pg_view_locks';

type UserRecord = {
	username: string;
	processedBy?: string;
};

type Deferred<T = void> = {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
};

function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

function event(id: string, aggregateId: string, username: string): IEvent<{ username: string }> {
	return {
		id,
		type: 'userCreated',
		aggregateId,
		aggregateVersion: 1,
		payload: { username }
	};
}

class UsersProjection extends AbstractPostgresqlObjectProjection<UserRecord> {

	static override get tableName() {
		return 'int_pg_users';
	}

	static override get schemaVersion() {
		return '1';
	}

	instanceId = 'unknown';
	calls: string[] = [];
	gate: Promise<void> | undefined;
	shouldFail = false;

	constructor(options: ConstructorParameters<typeof AbstractPostgresqlObjectProjection<UserRecord>>[0]) {
		super({
			...options,
			eventLockTableName: EVENT_LOCK_TABLE,
			viewLockTableName: VIEW_LOCK_TABLE
		});
	}

	async userCreated(e: IEvent<{ username: string }>) {
		this.calls.push(this.instanceId);

		if (this.gate)
			await this.gate;

		await this.view.updateEnforcingNew(String(e.aggregateId), () => ({
			username: e.payload!.username,
			processedBy: this.instanceId
		}));

		if (this.shouldFail)
			throw new Error(`${this.instanceId} failed`);
	}
}

describe('PostgreSQL projections (integration)', () => {

	let pool: Pool;

	beforeAll(async () => {
		pool = new Pool({ connectionString: CONNECTION_STRING });
		await pool.query('SELECT 1');
	});

	async function dropIntegrationTables() {
		await pool.query('DROP TABLE IF EXISTS int_pg_users_1');
		await pool.query('DROP TABLE IF EXISTS int_pg_object_storage');
		await pool.query(`DROP TABLE IF EXISTS ${EVENT_LOCK_TABLE}`);
		await pool.query(`DROP TABLE IF EXISTS ${VIEW_LOCK_TABLE}`);
	}

	afterAll(async () => {
		await pool.end();
	});

	beforeEach(async () => {
		await dropIntegrationTables();
	});

	afterEach(async () => {
		await dropIntegrationTables();
	});

	function projection(instanceId: string) {
		const p = new UsersProjection({
			viewModelPostgresqlDb: pool
		});
		p.instanceId = instanceId;

		return p;
	}

	async function warmUp(...projections: UsersProjection[]) {
		for (const p of projections) {
			await p.view.getLastEvent();
			await p.view.get('__warmup__');
		}
	}

	function objectView() {
		return new PostgresqlObjectView<UserRecord>({
			viewModelPostgresqlDb: pool,
			projectionName: 'UsersProjection',
			schemaVersion: '1',
			tableNamePrefix: 'int_pg_users',
			eventLockTableName: EVENT_LOCK_TABLE,
			viewLockTableName: VIEW_LOCK_TABLE
		});
	}

	function pauseInHandler(projectionInstance: UsersProjection) {
		const started = deferred();
		const unblock = deferred();
		const originalHandler = projectionInstance.userCreated.bind(projectionInstance);

		projectionInstance.gate = started.promise.then(() => unblock.promise);
		projectionInstance.userCreated = async eventToProcess => {
			started.resolve();
			await originalHandler(eventToProcess);
		};

		return { started, unblock };
	}

	it('stores object records with optimistic updates and deletes', async () => {
		const storage = new PostgresqlObjectStorage<UserRecord>({
			viewModelPostgresqlDb: pool,
			tableName: 'int_pg_object_storage'
		});

		await storage.create('user1', { username: 'alice' });
		await storage.update('user1', r => ({ ...r, username: 'alice-smith' }));

		expect(await storage.get('user1')).toEqual({ username: 'alice-smith' });
		expect(await storage.delete('user1')).toBe(true);
		expect(await storage.get('user1')).toBeUndefined();
	});

	it('coordinates schema-migration view locks across instances', async () => {
		const first = new PostgresqlViewLocker({
			viewModelPostgresqlDb: pool,
			projectionName: 'IntegrationProjection',
			schemaVersion: '1',
			viewLockTableName: VIEW_LOCK_TABLE,
			viewLockTtl: 500
		});
		const second = new PostgresqlViewLocker({
			viewModelPostgresqlDb: pool,
			projectionName: 'IntegrationProjection',
			schemaVersion: '1',
			viewLockTableName: VIEW_LOCK_TABLE,
			viewLockTtl: 500
		});

		await first.lock();

		let secondAcquired = false;
		const secondLocking = second.lock().then(() => {
			secondAcquired = true;
		});

		await delay(100);
		expect(secondAcquired).toBe(false);

		await first.unlock();
		await secondLocking;
		expect(secondAcquired).toBe(true);

		await second.unlock();
	});

	it('commits event claim, view update, processed marker, and checkpoint atomically', async () => {
		const p = projection('first');
		const e = event('event1', 'user1', 'alice');

		await p.project(e);

		expect(await p.view.get('user1')).toEqual({ username: 'alice', processedBy: 'first' });

		const lock = await pool.query(`
			SELECT processed_at
			FROM ${EVENT_LOCK_TABLE}
			WHERE projection_name = $1
				AND schema_version = $2
				AND event_id = $3
		`, ['UsersProjection', '1', 'event1']);
		expect(lock.rows[0].processed_at).toBeInstanceOf(Date);

		const checkpoint = await pool.query(`
			SELECT last_event
			FROM ${VIEW_LOCK_TABLE}
			WHERE projection_name = $1
				AND schema_version = $2
		`, ['UsersProjection', '1']);
		expect(checkpoint.rows[0].last_event).toEqual(JSON.stringify(e));
	});

	it('rolls back event claim and view update when projection handler fails', async () => {
		const p = projection('first');
		p.shouldFail = true;
		const e = event('event1', 'user1', 'alice');

		await expect(() => p.project(e))
			.rejects.toThrow('first failed');

		expect(await p.view.get('user1')).toBeUndefined();

		const locks = await pool.query(`SELECT * FROM ${EVENT_LOCK_TABLE}`);
		const checkpoints = await pool.query(`SELECT * FROM ${VIEW_LOCK_TABLE}`);
		expect(locks.rows).toHaveLength(0);
		expect(checkpoints.rows).toHaveLength(0);
	});

	it('deduplicates the same event delivered concurrently to multiple instances', async () => {
		const first = projection('first');
		const second = projection('second');
		const e = event('event1', 'user1', 'alice');

		await warmUp(first, second);

		const firstHandler = pauseInHandler(first);

		const firstProjecting = first.project(e);
		await firstHandler.started.promise;

		const secondProjecting = second.project(e);
		await delay(100);
		expect(second.calls).toEqual([]);

		firstHandler.unblock.resolve();
		await Promise.all([firstProjecting, secondProjecting]);

		const view = objectView();

		expect(await view.get('user1')).toEqual({ username: 'alice', processedBy: 'first' });
		expect(first.calls).toEqual(['first']);
		expect(second.calls).toEqual([]);
	});

	it('lets a waiting instance process the event if the first transaction rolls back', async () => {
		// setup
		const first = projection('first');
		const second = projection('second');
		const e = event('event1', 'user1', 'alice');

		await warmUp(first, second);

		first.shouldFail = true;
		const firstHandler = pauseInHandler(first);

		// actions
		const firstProjecting = first.project(e);
		await firstHandler.started.promise;

		const secondProjecting = second.project(e);
		await delay(100);

		// checks while the first transaction still owns the event lock
		expect(second.calls).toEqual([]);

		firstHandler.unblock.resolve();

		await expect(firstProjecting).rejects.toThrow('first failed');
		await secondProjecting;

		// final checks after rollback releases the event lock
		const view = objectView();

		expect(await view.get('user1')).toEqual({ username: 'alice', processedBy: 'second' });
		expect(first.calls).toEqual(['first']);
		expect(second.calls).toEqual(['second']);
	});

	it('allows different events to be processed by different instances concurrently', async () => {
		const first = projection('first');
		const second = projection('second');

		await warmUp(first, second);

		const firstHandler = pauseInHandler(first);

		const firstProjecting = first.project(event('event1', 'user1', 'alice'));
		await firstHandler.started.promise;

		await second.project(event('event2', 'user2', 'bob'));
		firstHandler.unblock.resolve();
		await firstProjecting;

		const view = objectView();

		expect(await view.get('user1')).toEqual({ username: 'alice', processedBy: 'first' });
		expect(await view.get('user2')).toEqual({ username: 'bob', processedBy: 'second' });
	});
});
