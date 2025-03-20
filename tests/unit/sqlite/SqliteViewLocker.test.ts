import { expect } from 'chai';
import * as createDb from 'better-sqlite3';
import { SqliteViewLocker } from '../../../src/infrastructure/sqlite';

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
		expect(result).to.be.true;
	});

	it('unlocks a view successfully', async function () {
		await firstLock.lock();
		firstLock.unlock();

		const lockResult = await secondLock.lock();
		expect(lockResult).to.be.true;
	});

	it('sets ready flag to `false` when locked', async () => {

		await firstLock.lock();
		expect(firstLock).to.have.property('ready', false);
	});

	it('sets ready flag to `true` when unlocked', async () => {

		await firstLock.lock();
		await firstLock.unlock();
		expect(firstLock).to.have.property('ready', true);
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
		expect(secondLockAcquired).to.be.false;

		firstLock.unlock();

		await secondLockAcquiring;
		expect(secondLockAcquired).to.be.true;
	});


	it('prolongs the lock while active', async function () {
		await firstLock.lock();

		const initial = viewModelSqliteDb.prepare(`SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?`)
			.get('test', '1.0') as any;

		expect(initial).to.have.property('locked_till').that.is.gt(Date.now());

		await jest.advanceTimersByTimeAsync(viewLockTtl);

		const updated = viewModelSqliteDb.prepare(`SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?`)
			.get('test', '1.0') as any;

		expect(updated).to.have.property('locked_till').that.is.gt(initial.locked_till);
	});

	it('should release the lock upon unlock()', async function () {
		await firstLock.lock();
		firstLock.unlock();

		const row = viewModelSqliteDb.prepare(`SELECT * FROM tbl_view_lock WHERE projection_name = ? AND schema_version = ?`)
			.get('test', '1.0') as any;

		expect(row.locked_till).to.be.null;
	});

	it('should fail to prolong the lock if already released', async function () {
		await firstLock.lock();
		firstLock.unlock();

		let error;
		try {
			await (firstLock as any).prolongLock();
		}
		catch (err) {
			error = err;
		}

		expect(error).to.exist;
		expect(error).to.have.property('message', '"test" lock could not be prolonged');
	});
});
