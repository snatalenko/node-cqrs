import * as createDb from 'better-sqlite3';
import { SqliteEventLocker } from '../../../src/sqlite/SqliteEventLocker';
import { IEvent } from '../../../src/interfaces';
import { guid } from '../../../src/sqlite';
import { promisify } from 'util';
const delay = promisify(setTimeout);

describe('SqliteEventLocker', () => {

	let db: import('better-sqlite3').Database;
	let locker: SqliteEventLocker;
	const testEvent: IEvent<any> = { id: 'event1', type: 'TEST_EVENT', payload: {} };

	beforeEach(() => {
		db = createDb(':memory:');
		locker = new SqliteEventLocker({
			viewModelSqliteDb: db,
			projectionName: 'test',
			schemaVersion: '1.0',
			eventLockTableName: 'test_event_lock',
			viewLockTableName: 'test_view_lock',
			eventLockTtl: 50 // ms
		});
	});

	afterEach(() => {
		db.close();
	});

	it('allows marking an event as projecting', async () => {
		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(true);
	});

	it('prevents re-locking an already locked event', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(false);
	});

	it('marks an event as projected', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		await locker.markAsProjected(testEvent); // Assuming markAsProjected might become async

		// DB query remains synchronous with better-sqlite3
		const row = db.prepare('SELECT processed_at FROM test_event_lock WHERE event_id = ?')
			.get(guid(testEvent.id)) as any;

		expect(row).toBeDefined();
		expect(row.processed_at).not.toBeNull();
	});

	it('retrieves the last projected event', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		await locker.markAsProjected(testEvent);

		const lastEvent = await locker.getLastEvent(); // Assuming getLastEvent might become async

		expect(lastEvent).toEqual(testEvent);
	});

	it('returns undefined if no event has been projected', async () => {
		const lastEvent = await locker.getLastEvent();
		expect(lastEvent).toBeUndefined();
	});

	it('fails to mark an event as projected if it was never locked', async () => {
		await expect(() => locker.markAsProjected(testEvent))
			.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
	});

	it('allows re-locking after TTL expires', async () => {
		await locker.tryMarkAsProjecting(testEvent);

		await delay(51); // Wait for TTL to expire

		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(true);
	});

	it('fails to update an event if its version is modified in DB', async () => {
		await locker.tryMarkAsProjecting(testEvent);

		db.prepare('UPDATE test_event_lock SET processed_at = ? WHERE event_id = ?')
			.run(Date.now(), guid(testEvent.id));

		await expect(() => locker.markAsProjected(testEvent))
			.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
	});
});
