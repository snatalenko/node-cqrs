import { AbstractProjection } from '../../../src/AbstractProjection.ts';
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

	async recordEvent(e: IEvent) {
		await this.assertConnection();
		await this.connection.query(`
			INSERT INTO projection_records (id, data)
			VALUES ($1, $2::jsonb)
		`, [e.aggregateId!, JSON.stringify({ eventId: e.id })]);
	}
}

class TestProjection extends AbstractProjection<TestPostgresqlView> {
	shouldFail = false;
	processedEvents: IEvent[] = [];

	constructor(view: TestPostgresqlView) {
		super({ view });
	}

	async somethingHappened(e: IEvent) {
		this.processedEvents.push(e);
		await this.view.recordEvent(e);
		if (this.shouldFail)
			throw new Error('projection failed');
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

	describe('waitFor', () => {

		it('resolves once the event is marked as projected', async () => {
			await view.tryMarkAsProjecting(testEvent);
			const waiting = view.waitFor(testEvent.id!, { timeout: 1_000 });

			await view.markAsProjected(testEvent);

			await expect(waiting).resolves.toBeUndefined();
		});

		it('rejects when the event is marked as failed', async () => {
			const error = new Error('projection failed');
			const waiting = view.waitFor(testEvent.id!, { timeout: 1_000 });

			view.markAsFailed(testEvent, error);

			await expect(waiting).rejects.toBe(error);
		});
	});

	describe('as a projection view', () => {

		let projection: TestProjection;

		beforeEach(() => {
			projection = new TestProjection(view);
		});

		it('commits view changes and event processing markers in one runtime transaction', async () => {
			await projection.project(testEvent);

			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(db.objectRecords.get('1')?.data).toEqual({ eventId: 'evt1' });
			expect(db.eventLocks.get('test:1:evt1')?.processedAt).toBeInstanceOf(Date);
			expect(db.viewLocks.has('test:1')).toBe(false);
		});

		it('rolls back event processing markers when the handler fails', async () => {
			projection.shouldFail = true;

			await expect(projection.project(testEvent)).rejects.toThrow('projection failed');

			expect(db.transactionLog).toEqual(['BEGIN', 'ROLLBACK']);
			expect(db.objectRecords.has('1')).toBe(false);
			expect(db.eventLocks.has('test:1:evt1')).toBe(false);
			expect(db.viewLocks.has('test:1')).toBe(false);
		});

		it('resolves eventTracker.waitFor only after the runtime transaction is committed', async () => {
			let transactionLogOnResolve: string[] | undefined;
			const waiting = projection.eventTracker.waitFor(testEvent.id!, { timeout: 1_000 }).then(() => {
				transactionLogOnResolve = [...db.transactionLog];
			});

			await projection.project(testEvent);
			await waiting;

			expect(transactionLogOnResolve).toEqual(['BEGIN', 'COMMIT']);
		});

		it('rejects eventTracker.waitFor when the handler fails', async () => {
			projection.shouldFail = true;
			const waiting = projection.eventTracker.waitFor(testEvent.id!, { timeout: 1_000 });

			await expect(projection.project(testEvent)).rejects.toThrow('projection failed');

			await expect(waiting).rejects.toThrow('projection failed');
		});

		it('waits for the view to become ready before opening the transaction', async () => {
			await view.lock();

			let processed = false;
			const processing = projection.project(testEvent).then(() => {
				processed = true;
			});

			await new Promise<void>(resolve => setImmediate(resolve));
			expect(processed).toBe(false);
			expect(db.transactionLog).toEqual([]);

			await view.unlock();
			await processing;

			expect(processed).toBe(true);
			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		});

		it('does not open a transaction for every event during restore', async () => {
			const eventStore = {
				async* getEventsByTypes() {
					yield testEvent;
				}
			};

			await projection.restore(eventStore as any);

			expect(db.transactionLog).toEqual([]);
			expect(projection.processedEvents).toEqual([testEvent]);
		});
	});
});
