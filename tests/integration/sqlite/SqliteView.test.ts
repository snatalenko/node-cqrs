import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import { AbstractProjection, IEvent } from '../../../src';
import { AbstractSqliteObjectProjection, SqliteEventStorage, SqliteObjectView } from '../../../src/sqlite';
import createDb from 'better-sqlite3';

const delay = promisify(setTimeout);

type UserPayload = {
	name: string;
}

class MyDumbProjection extends AbstractProjection<SqliteObjectView<any>> {

	async userCreated(e: IEvent<UserPayload>) {
		if (typeof e.aggregateId !== 'string')
			throw new TypeError('e.aggregateId is required');
		if (!e.payload)
			throw new TypeError('e.payload is required');

		await this.view.create(e.aggregateId, e.payload);
	}

	async userModified(e: IEvent<UserPayload>) {
		if (typeof e.aggregateId !== 'string')
			throw new TypeError('e.aggregateId is required');
		if (!e.payload)
			throw new TypeError('e.payload is required');

		await this.view.update(e.aggregateId, _u => e.payload);
	}
}

describe('SqliteView', () => {

	let viewModelSqliteDb: import('better-sqlite3').Database;

	const fileName = './test.sqlite';

	beforeEach(() => {
		viewModelSqliteDb = createDb(fileName);

		// Write-Ahead Logging (WAL) mode allows reads and writes to happen concurrently and reduces contention
		// on the database. It keeps changes in a separate log file before they are flushed to the main database file
		viewModelSqliteDb.pragma('journal_mode = WAL');

		// The synchronous pragma controls how often SQLite synchronizes writes to the filesystem. Lowering this can
		// boost performance but increases the risk of data loss in the event of a crash.
		viewModelSqliteDb.pragma('synchronous = NORMAL');

		// Limit WAL journal size to 5MB to manage disk usage in high-write scenarios.
		// With WAL mode and NORMAL sync, this helps prevent excessive file growth during transactions.
		viewModelSqliteDb.pragma(`journal_size_limit = ${5 * 1024 * 1024}`);
	});

	afterEach(() => {
		if (viewModelSqliteDb)
			viewModelSqliteDb.close();
		if (existsSync(fileName))
			unlinkSync(fileName);
	});

	// project 10_000 events (5_000 create new, 5_000 read, update, put back)
	// in memory - 113 ms (88_500 events/second)
	// on file system - 44_396 ms (225 events/second)
	// on file system with WAL and NORMAL sync - 551 ms (18_148 events/second)

	it('handles 1_000 events within 0.5 seconds', async () => {

		const p = new MyDumbProjection({
			view: new SqliteObjectView({
				schemaVersion: '1',
				viewModelSqliteDb,
				projectionName: 'tbl_test',
				tableNamePrefix: 'tbl_test'
			})
		});

		await p.view.lock();
		await p.view.unlock();

		const aggregateIds = Array.from({ length: 1_000 }, (v, i) => ({
			aggregateId: `${i}A`.padStart(32, '0'),
			eventId: `${i}B`.padStart(32, '0')
		}));

		const startTs = Date.now();

		for (const { aggregateId, eventId } of aggregateIds) {
			await p.project({
				type: 'userCreated',
				id: eventId,
				aggregateId,
				payload: {
					name: 'Jon'
				}
			});

			await p.project({
				type: 'userModified',
				aggregateId,
				payload: {
					name: 'Jon Doe'
				}
			});
		}

		const totalMs = Date.now() - startTs;
		expect(totalMs).toBeLessThan(500);

		const user = await p.view.get('0000000000000000000000000000999A');
		expect(user).toEqual({
			name: 'Jon Doe'
		});

		// console.log({
		// 	tbl_view_lock: viewModelSqliteDb.prepare(`SELECT * FROM tbl_view_lock LIMIT 3`).all(),
		// 	tbl_test_1_event_lock: viewModelSqliteDb.prepare(`SELECT * FROM tbl_event_lock LIMIT 3`).all(),
		// 	tbl_test_1: viewModelSqliteDb.prepare(`SELECT * FROM tbl_test_1 LIMIT 3`).all()
		// });
	});

	describe('runtime transactions', () => {

		class UsersProjection extends AbstractSqliteObjectProjection<UserPayload> {
			static get tableName() {
				return 'tbl_users';
			}

			static get schemaVersion() {
				return '1';
			}

			gate: Promise<void> | undefined;
			shouldFail = false;

			async userCreated(e: IEvent<UserPayload>) {
				await this.view.create(e.aggregateId!, e.payload!);
				await this.gate;
				if (this.shouldFail)
					throw new Error('projection failed');
			}
		}

		const userCreated = (name: string): IEvent<UserPayload> => ({
			type: 'userCreated',
			id: randomUUID().replaceAll('-', ''),
			aggregateId: randomUUID().replaceAll('-', ''),
			payload: { name }
		});

		let projection: UsersProjection;

		beforeEach(async () => {
			projection = new UsersProjection({ viewModelSqliteDb } as any);
			await projection.view.getLastEvent();
		});

		it('rolls back view changes, event claim, and checkpoint when the handler fails', async () => {
			const e = userCreated('Jon');
			projection.shouldFail = true;

			await expect(projection.project(e)).rejects.toThrow('projection failed');

			expect(await projection.view.get(e.aggregateId!)).toBeUndefined();
			expect(await projection.view.getLastEvent()).toBeUndefined();

			projection.shouldFail = false;
			await projection.project(e);

			expect(await projection.view.get(e.aggregateId!)).toEqual({ name: 'Jon' });
			expect(await projection.view.getLastEvent()).toEqual(e);
		});

		it('serializes concurrent events projected through the same database', async () => {
			const events = Array.from({ length: 20 }, (_, i) => userCreated(`user${i}`));

			await Promise.all(events.map(e => projection.project(e)));

			for (const e of events)
				expect(await projection.view.get(e.aggregateId!)).toEqual(e.payload);
		});

		it('hides uncommitted changes from other connections and from reads outside of the transaction', async () => {
			const e = userCreated('Jon');
			let unblock!: () => void;
			projection.gate = new Promise(resolve => {
				unblock = resolve;
			});
			projection.shouldFail = true;
			const otherConnection = createDb(fileName, { readonly: true });

			try {
				const projecting = projection.project(e);
				await delay(10);

				const reading = projection.view.get(e.aggregateId!);
				expect(otherConnection.prepare('SELECT count(*) FROM tbl_users_1').pluck().get()).toBe(0);

				unblock();
				await expect(projecting).rejects.toThrow('projection failed');

				expect(await reading).toBeUndefined();
			}
			finally {
				otherConnection.close();
			}
		});

		it('waits for a transaction of another connection to the same file without blocking it', async () => {
			const otherConnection = createDb(fileName, { timeout: 1_000 });
			try {
				const other = new UsersProjection({ viewModelSqliteDb: otherConnection } as any);
				await other.view.getLastEvent();
				let unblock!: () => void;
				projection.gate = new Promise(resolve => {
					unblock = resolve;
				});
				const first = userCreated('Jon');
				const second = userCreated('Jane');

				const projecting = projection.project(first);
				await delay(10);
				const otherProjecting = other.project(second);
				await delay(10);
				unblock();

				await Promise.all([projecting, otherProjecting]);

				expect(await projection.view.get(first.aggregateId!)).toEqual({ name: 'Jon' });
				expect(await projection.view.get(second.aggregateId!)).toEqual({ name: 'Jane' });
			}
			finally {
				otherConnection.close();
			}
		});

		it('keeps events committed during a projection transaction that is rolled back later', async () => {
			const eventStorage = new SqliteEventStorage({ viewModelSqliteDb });
			await eventStorage.assertConnection();
			const e = userCreated('Jon');
			let unblock!: () => void;
			projection.gate = new Promise(resolve => {
				unblock = resolve;
			});
			projection.shouldFail = true;

			const projecting = projection.project(userCreated('Jane'));
			await delay(10);

			const committing = eventStorage.commitEvents([e]);
			unblock();

			await expect(projecting).rejects.toThrow('projection failed');
			await committing;

			const stored = [];
			for await (const storedEvent of eventStorage.getEventsByTypes(['userCreated']))
				stored.push(storedEvent);

			expect(stored).toEqual([e]);
		});
	});
});
