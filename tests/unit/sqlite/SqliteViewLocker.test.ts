import createDb from 'better-sqlite3';
import { SqliteViewLocker } from '../../../src/sqlite';

describe('SqliteViewLocker', function () {

	const viewLockTtl = 1_000; // 1sec
	let viewModelSqliteDb: import('better-sqlite3').Database;
	let firstLock: SqliteViewLocker;
	let secondLock: SqliteViewLocker;

	beforeEach(() => {
		viewModelSqliteDb = createDb(':memory:');
		firstLock = new SqliteViewLocker({
			viewModelSqliteDb,
			projectionName: 'test',
			schemaVersion: '1.0',
			viewLockTtl
		});
		secondLock = new SqliteViewLocker({
			viewModelSqliteDb,
			projectionName: 'test',
			schemaVersion: '1.0',
			viewLockTtl
		});

		jest.useFakeTimers();
	});

	afterEach(() => {
		viewModelSqliteDb.close();
	});

	it('locks a view successfully', async function () {
		const result = await firstLock.lock();
		expect(result).toBe(true);
	});

	it('unlocks a view successfully', async function () {
		await firstLock.lock();
		firstLock.unlock();

		const lockResult = await secondLock.lock();
		expect(lockResult).toBe(true);
	});

	it('sets ready flag to `false` when locked', async () => {

		await firstLock.lock();
		expect(firstLock).toHaveProperty('ready', false);
	});

	it('sets ready flag to `true` when unlocked', async () => {

		await firstLock.lock();
		await firstLock.unlock();
		expect(firstLock).toHaveProperty('ready', true);
	});

	it('waits for the lock to be released if already locked', async function () {
		await firstLock.lock();

		let secondLockAcquired = false;

		// Try locking, but it should wait
		const secondLockAcquiring = secondLock.lock().then(() => {
			secondLockAcquired = true;
		});

		// Wait briefly to check if it resolves too soon
		await jest.advanceTimersByTimeAsync(viewLockTtl);
		expect(secondLockAcquired).toBe(false);

		firstLock.unlock();

		await secondLockAcquiring;
		expect(secondLockAcquired).toBe(true);
	});


	it('prolongs the lock while active', async function () {
		await firstLock.lock();

		const initial = viewModelSqliteDb.prepare('SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?')
			.get('test', '1.0') as any;

		expect(initial).toHaveProperty('locked_till');
		expect(initial.locked_till).toBeGreaterThan(Date.now());

		await jest.advanceTimersByTimeAsync(viewLockTtl);

		const updated = viewModelSqliteDb.prepare('SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?')
			.get('test', '1.0') as any;

		expect(updated).toHaveProperty('locked_till');
		expect(updated.locked_till).toBeGreaterThan(initial.locked_till);
	});

	it('should release the lock upon unlock()', async function () {
		await firstLock.lock();
		await firstLock.unlock();

		const row = viewModelSqliteDb.prepare('SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?')
			.get('test', '1.0') as any;

		expect(row.locked_till).toBeNull();
	});

	it('should fail to prolong the lock if already released', async function () {
		await firstLock.lock();
		await firstLock.unlock();

		let error;
		try {
			await (firstLock as any).prolongLock();
		}
		catch (err) {
			error = err;
		}

		expect(error).toBeDefined();
		expect(error).toHaveProperty('message', '"test" lock could not be prolonged');
	});

	it('unlock() handles missing lock row gracefully', async () => {
		await firstLock.unlock();
	});

	it('once() throws for unexpected events', () => {
		expect(() => firstLock.once('unexpected' as any))
			.toThrow(TypeError, 'Unexpected event: unexpected');
	});
});
