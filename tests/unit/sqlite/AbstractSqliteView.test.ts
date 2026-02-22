import { expect } from 'chai';
import createDb from 'better-sqlite3';
import { SqliteObjectView } from '../../../src/sqlite';
import type { IEvent } from '../../../src/interfaces';

function makeView(db: import('better-sqlite3').Database, extra?: object) {
	return new SqliteObjectView({
		viewModelSqliteDb: db,
		projectionName: 'test',
		tableNamePrefix: 'tbl_test',
		schemaVersion: '1',
		...extra
	});
}

const testEvent: IEvent<any> = { id: 'evt1', type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 };

describe('AbstractSqliteView', function () {

	let db: import('better-sqlite3').Database;
	let view: SqliteObjectView<any>;

	beforeEach(() => {
		db = createDb(':memory:');
		view = makeView(db);
	});

	afterEach(() => {
		db.close();
	});

	describe('ready', () => {

		it('is true initially', () => {
			expect(view.ready).to.be.true;
		});

		it('is false after lock()', async () => {
			await view.lock();
			expect(view.ready).to.be.false;
		});

		it('is true after unlock()', async () => {
			await view.lock();
			view.unlock();
			expect(view.ready).to.be.true;
		});
	});

	describe('lock / unlock', () => {

		it('lock() returns true', async () => {
			const result = await view.lock();
			expect(result).to.be.true;
		});

		it('unlock() allows re-locking', async () => {
			await view.lock();
			view.unlock();
			const result = await view.lock();
			expect(result).to.be.true;
		});
	});

	describe('once', () => {

		it('resolves immediately when not locked', async () => {
			// Should not hang; if the promise is pending this test would time out
			await view.once('ready');
		});

		it('resolves after unlock()', async () => {
			await view.lock();

			let resolved = false;
			const p = view.once('ready').then(() => {
				resolved = true;
			});

			expect(resolved).to.be.false;
			view.unlock();

			await p;
			expect(resolved).to.be.true;
		});
	});

	describe('getLastEvent', () => {

		it('returns undefined when no event has been projected', async () => {
			const result = await view.getLastEvent();
			expect(result).to.be.undefined;
		});

		it('returns the last projected event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			await view.markAsProjected(testEvent);

			const result = await view.getLastEvent();
			expect(result).to.deep.equal(testEvent);
		});
	});

	describe('tryMarkAsProjecting', () => {

		it('returns true for a new event', async () => {
			const result = await view.tryMarkAsProjecting(testEvent);
			expect(result).to.be.true;
		});

		it('returns false for an already-locked event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			const result = await view.tryMarkAsProjecting(testEvent);
			expect(result).to.be.false;
		});
	});

	describe('markAsProjected', () => {

		it('marks event as projected', async () => {
			await view.tryMarkAsProjecting(testEvent);
			await view.markAsProjected(testEvent);

			const last = await view.getLastEvent();
			expect(last).to.deep.equal(testEvent);
		});

		it('throws if event was never locked', async () => {
			let error = null;
			try {
				await view.markAsProjected(testEvent);
			}
			catch (err) {
				error = err;
			}
			expect(error).to.exist;
		});
	});
});
