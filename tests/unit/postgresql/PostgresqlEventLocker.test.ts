import { type IEvent } from '../../../src/interfaces/index.ts';
import { TimeoutError } from '../../../src/errors/index.ts';
import { PostgresqlEventLocker, type PostgresqlConnection } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('PostgresqlEventLocker', () => {

	let db: MockPostgresqlConnection;
	let locker: PostgresqlEventLocker;
	const testEvent: IEvent<any> = { id: 'event1', type: 'TEST_EVENT', payload: {} };

	beforeEach(() => {
		db = new MockPostgresqlConnection();
		locker = new PostgresqlEventLocker({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1.0',
			eventLockTableName: 'test_event_lock',
			viewLockTableName: 'test_view_lock',
			eventLockTtl: 50
		});
	});

	it('allows marking an event as projecting', async () => {
		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(true);
	});

	it('generates deterministic ids for events without string id', async () => {
		const eventWithoutId: IEvent<any> = { type: 'TEST_EVENT', payload: { n: 1 } };

		expect(await locker.tryMarkAsProjecting(eventWithoutId)).toBe(true);
		expect(db.eventLocks.size).toBe(1);
	});

	it('prevents re-locking an already locked event', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(false);
	});

	it('allows re-locking after TTL expires', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		db.expireEventLock('test', '1.0', 'event1', 51);

		const result = await locker.tryMarkAsProjecting(testEvent);
		expect(result).toBe(true);
	});

	it('marks an event as projected', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		await locker.markAsProjected(testEvent);

		const eventLock = db.eventLocks.get('test:1.0:event1');
		expect(eventLock?.processedAt).toBeInstanceOf(Date);
	});

	it('retrieves the last projected event via markAsLastEvent', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		await locker.markAsProjected(testEvent);
		await locker.markAsLastEvent(testEvent);

		const lastEvent = await locker.getLastEvent();

		expect(lastEvent).toEqual(testEvent);
	});

	it('does not record last event on markAsProjected alone', async () => {
		await locker.tryMarkAsProjecting(testEvent);
		await locker.markAsProjected(testEvent);

		const lastEvent = await locker.getLastEvent();
		expect(lastEvent).toBeUndefined();
	});

	it('returns undefined if no event has been projected', async () => {
		const lastEvent = await locker.getLastEvent();
		expect(lastEvent).toBeUndefined();
	});

	it('fails to mark an event as projected if it was never locked', async () => {
		await expect(() => locker.markAsProjected(testEvent))
			.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
	});

	describe('waitFor', () => {

		it('resolves once the event is marked as projected', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			const waiting = locker.waitFor(testEvent.id!, { timeout: 1_000 });

			await locker.markAsProjected(testEvent);

			await expect(waiting).resolves.toBeUndefined();
		});

		it('resolves immediately for events projected earlier', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			await locker.markAsProjected(testEvent);

			await expect(locker.waitFor(testEvent.id!)).resolves.toBeUndefined();
		});

		it('resolves once another instance marks the event as projected in the shared storage', async () => {
			const otherLocker = new PostgresqlEventLocker({
				viewModelPostgresqlDb: db,
				projectionName: 'test',
				schemaVersion: '1.0',
				eventLockTableName: 'test_event_lock',
				viewLockTableName: 'test_view_lock'
			});
			const numericIdEvent: IEvent<any> = { id: 42, type: 'TEST_EVENT', payload: {} };
			await otherLocker.tryMarkAsProjecting(testEvent);
			await otherLocker.tryMarkAsProjecting(numericIdEvent);

			const waiting = locker.waitFor([testEvent.id!, numericIdEvent.id!], { timeout: 1_000 });

			await otherLocker.markAsProjected(testEvent);
			await otherLocker.markAsProjected(numericIdEvent);

			await expect(waiting).resolves.toBeUndefined();
		});

		it('resolves only after the transaction marking the event as projected is committed', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			const waiting = locker.waitFor(testEvent.id!, { timeout: 1_000 });
			let resolved = false;
			waiting.then(() => {
				resolved = true;
			});

			await locker.runInTransaction(async () => {
				await locker.markAsProjected(testEvent);
				await new Promise(setImmediate);
				expect(resolved).toBe(false);
			});

			await expect(waiting).resolves.toBeUndefined();
		});

		it('does not resolve when the transaction marking the event as projected is rolled back', async () => {
			await locker.tryMarkAsProjecting(testEvent);
			const waiting = locker.waitFor(testEvent.id!, { timeout: 20 });

			await expect(locker.runInTransaction(async () => {
				await locker.markAsProjected(testEvent);
				throw new Error('projection failed');
			})).rejects.toThrow('projection failed');

			await expect(waiting).rejects.toThrow(TimeoutError);
		});

		describe('with a single (non-pool) connection', () => {

			let singleConnection: PostgresqlConnection;
			let singleConnectionLocker: PostgresqlEventLocker;
			let otherLocker: PostgresqlEventLocker;

			beforeEach(() => {
				singleConnection = { query: (text, values) => db.query(text, values) };
				const options = {
					viewModelPostgresqlDb: singleConnection,
					projectionName: 'test',
					schemaVersion: '1.0',
					eventLockTableName: 'test_event_lock',
					viewLockTableName: 'test_view_lock'
				};
				singleConnectionLocker = new PostgresqlEventLocker(options);
				otherLocker = new PostgresqlEventLocker(options);
			});

			it('does not resolve from uncommitted markers of a transaction rolled back later', async () => {
				await otherLocker.tryMarkAsProjecting(testEvent);
				const waiting = singleConnectionLocker.waitFor(testEvent.id!, { timeout: 200 });

				await expect(otherLocker.runInTransaction(async () => {
					await otherLocker.markAsProjected(testEvent);
					await new Promise(resolve => setTimeout(resolve, 100)); // polls run meanwhile
					throw new Error('projection failed');
				})).rejects.toThrow('projection failed');

				await expect(waiting).rejects.toThrow(TimeoutError);
			});

			it('resolves from markers committed by a transaction', async () => {
				await otherLocker.tryMarkAsProjecting(testEvent);
				const waiting = singleConnectionLocker.waitFor(testEvent.id!, { timeout: 1_000 });

				await otherLocker.runInTransaction(async () => {
					await otherLocker.markAsProjected(testEvent);
					await new Promise(resolve => setTimeout(resolve, 100));
				});

				await expect(waiting).resolves.toBeUndefined();
			});
		});

		it('rejects when the event is marked as failed', async () => {
			const error = new Error('projection failed');
			const waiting = locker.waitFor(testEvent.id!, { timeout: 1_000 });

			locker.markAsFailed(testEvent, error);

			await expect(waiting).rejects.toBe(error);
		});

		it('does not resolve when the event could not be marked as projected', async () => {
			const waiting = locker.waitFor(testEvent.id!, { timeout: 20 });

			await expect(locker.markAsProjected(testEvent)).rejects.toThrow();

			await expect(waiting).rejects.toThrow(TimeoutError);
		});
	});
});
