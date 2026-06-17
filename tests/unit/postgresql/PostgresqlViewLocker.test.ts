import { PostgresqlViewLocker } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('PostgresqlViewLocker', () => {

	const viewLockTtl = 1_000;
	let db: MockPostgresqlConnection;
	let firstLock: PostgresqlViewLocker;
	let secondLock: PostgresqlViewLocker;

	beforeEach(() => {
		db = new MockPostgresqlConnection();
		firstLock = new PostgresqlViewLocker({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			viewLockTtl
		});
		secondLock = new PostgresqlViewLocker({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			viewLockTtl
		});

		jest.useFakeTimers();
	});

	afterEach(async () => {
		if (!firstLock.ready)
			await firstLock.unlock();
		if (!secondLock.ready)
			await secondLock.unlock();

		jest.useRealTimers();
	});

	it('validates optional parameters', () => {
		expect(() => new PostgresqlViewLocker({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			viewLockTableName: ''
		})).toThrow('o.viewLockTableName must be a non-empty String');

		expect(() => new PostgresqlViewLocker({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			viewLockTtl: -1
		})).toThrow('o.viewLockTtl must be a non-negative integer');
	});

	it('waits until an existing lock is released', async () => {
		await firstLock.lock();

		let secondAcquired = false;
		const secondLocking = secondLock.lock().then(() => {
			secondAcquired = true;
		});

		await jest.advanceTimersByTimeAsync(viewLockTtl / 2);
		expect(secondAcquired).toBe(false);

		await firstLock.unlock();
		await jest.advanceTimersByTimeAsync(viewLockTtl / 2);
		await secondLocking;

		expect(secondAcquired).toBe(true);
	});

	it('prolongs the lock while active', async () => {
		await firstLock.lock();
		const initial = db.viewLocks.get('test:1')!.lockedTill!.getTime();

		await jest.advanceTimersByTimeAsync(viewLockTtl / 2);

		expect(db.viewLocks.get('test:1')!.lockedTill!.getTime()).toBeGreaterThan(initial);
	});

	it('throws when active lock cannot be prolonged', async () => {
		await firstLock.lock();
		db.viewLocks.get('test:1')!.lockToken = 'other';

		await expect((firstLock as any).prolongLock())
			.rejects.toThrow('"test" lock could not be prolonged');
	});

	it('warns when unlock cannot find the lock', async () => {
		await firstLock.unlock();
	});

	it('once() throws for unexpected events', () => {
		expect(() => firstLock.once('unexpected' as any))
			.toThrow(TypeError, 'Unexpected event: unexpected');
	});
});
