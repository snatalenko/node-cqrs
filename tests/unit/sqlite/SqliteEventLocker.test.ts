import { expect } from 'chai';
import * as createDb from 'better-sqlite3';
import { SqliteEventLocker } from '../../../src/sqlite/SqliteEventLocker';
import { IEvent } from '../../../src/interfaces';
import { guid } from '../../../src/sqlite';
import { promisify } from 'util';
const delay = promisify(setTimeout);

describe('SqliteEventLocker', function () {

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
		jest.useFakeTimers();
	});

	afterEach(() => {
		db.close();
		jest.useRealTimers();
	});

	it('allows marking an event as projecting', function () {
		const result = locker.tryMarkAsProjecting(testEvent);
		expect(result).to.be.true;
	});

	it('prevents re-locking an already locked event', function () {
		locker.tryMarkAsProjecting(testEvent);
		const result = locker.tryMarkAsProjecting(testEvent);
		expect(result).to.be.false;
	});

	it('marks an event as projected', function () {
		locker.tryMarkAsProjecting(testEvent);
		locker.markAsProjected(testEvent);

		const row = db.prepare(`SELECT processed_at FROM test_event_lock WHERE event_id = ?`)
			.get(guid(testEvent.id)) as any;

		expect(row).to.exist;
		expect(row.processed_at).to.not.be.null;
	});

	it('retrieves the last projected event', function () {
		
		locker.tryMarkAsProjecting(testEvent);
		locker.markAsProjected(testEvent);

		const lastEvent = locker.getLastEvent();

		expect(lastEvent).to.deep.equal(testEvent);
	});

	it('returns undefined if no event has been projected', function () {
		const lastEvent = locker.getLastEvent();
		expect(lastEvent).to.be.undefined;
	});

	it('fails to mark an event as projected if it was never locked', function () {
		expect(() => locker.markAsProjected(testEvent))
			.to.throw(Error, `Event ${testEvent.id} could not be marked as processed`);
	});

	it('allows re-locking after TTL expires', async function () {

		locker.tryMarkAsProjecting(testEvent);

		await delay(51);

		const result = locker.tryMarkAsProjecting(testEvent);
		expect(result).to.be.true;
	});

	it('fails to update an event if its version is modified in DB', function () {
	
		locker.tryMarkAsProjecting(testEvent);

		// Modify the event in DB to simulate an external change
		db.prepare('UPDATE test_event_lock SET processed_at = ? WHERE event_id = ?')
			.run(Date.now(), guid(testEvent.id));

		// Attempt to finalize the event processing
		expect(() => locker.markAsProjected(testEvent))
			.to.throw(Error, `Event ${testEvent.id} could not be marked as processed`);
	});
});
