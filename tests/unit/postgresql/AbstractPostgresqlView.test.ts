import type { IEvent } from '../../../src/interfaces/index.ts';
import {
	AbstractPostgresqlView,
	type PostgresqlConnection
} from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

class TestPostgresqlView extends AbstractPostgresqlView {

	protected initialize(_db: PostgresqlConnection): Promise<void> | void {
		// No custom schema is needed for these tests.
	}
}

function makeView(db: MockPostgresqlConnection, extra?: object) {
	return new TestPostgresqlView({
		viewModelPostgresqlDb: db,
		projectionName: 'test',
		schemaVersion: '1',
		...extra
	});
}

const testEvent: IEvent<any> = { id: 'evt1', type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 };

describe('AbstractPostgresqlView', () => {

	let db: MockPostgresqlConnection;
	let view: TestPostgresqlView;

	beforeEach(() => {
		db = new MockPostgresqlConnection();
		view = makeView(db);
	});

	describe('ready', () => {

		it('is true initially', () => {
			expect(view.ready).toBe(true);
		});

		it('is false after lock()', async () => {
			await view.lock();
			expect(view.ready).toBe(false);
			await view.unlock();
		});

		it('is true after unlock()', async () => {
			await view.lock();
			await view.unlock();
			expect(view.ready).toBe(true);
		});
	});

	describe('lock / unlock', () => {

		it('lock() returns true', async () => {
			const result = await view.lock();
			expect(result).toBe(true);
			await view.unlock();
		});

		it('unlock() allows re-locking', async () => {
			await view.lock();
			await view.unlock();
			const result = await view.lock();
			expect(result).toBe(true);
			await view.unlock();
		});
	});

	describe('once', () => {

		it('resolves immediately when not locked', async () => {
			await view.once('ready');
		});

		it('resolves after unlock()', async () => {
			await view.lock();

			let resolved = false;
			const p = view.once('ready').then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);
			await view.unlock();

			await p;
			expect(resolved).toBe(true);
		});
	});

	describe('event checkpointing', () => {

		it('returns undefined when no event has been projected', async () => {
			const result = await view.getLastEvent();
			expect(result).toBeUndefined();
		});

		it('returns the last projected event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			await view.markAsProjected(testEvent);
			await view.markAsLastEvent(testEvent);

			const result = await view.getLastEvent();
			expect(result).toEqual(testEvent);
		});

		it('returns false for an already locked event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			const result = await view.tryMarkAsProjecting(testEvent);
			expect(result).toBe(false);
		});

		it('throws if event was never locked', async () => {
			await expect(() => view.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});
	});
});
