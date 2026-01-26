import { existsSync, unlinkSync } from 'fs';
import { AbstractProjection, IEvent } from '../../../src';
import { SqliteObjectStorage, SqliteObjectView, guid } from '../../../src/sqlite';
import * as createDb from 'better-sqlite3';

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

	it('updateEnforcingNew is safe under same-process concurrency', async () => {
		const storage = new SqliteObjectStorage<{ n: number }>({
			viewModelSqliteDb,
			tableName: 'tbl_concurrency'
		});

		const id = '00000000000000000000000000000001';

		await storage.assertConnection();


		const p1 = storage.updateEnforcingNew(id, r => ({ n: (r?.n ?? 0) + 1 }));
		const p2 = storage.updateEnforcingNew(id, r => ({ n: (r?.n ?? 0) + 1 }));

		await Promise.all([p1, p2]);

		const record = await storage.get(id);
		expect(record).toEqual({ n: 2 });

		const row = viewModelSqliteDb.prepare(`
			SELECT version
			FROM tbl_concurrency
			WHERE id = ?
		`).get(guid(id));

		expect(row?.version).toBe(2);
	});
});
