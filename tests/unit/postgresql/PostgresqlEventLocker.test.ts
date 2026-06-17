import { type IEvent } from '../../../src/interfaces/index.ts';
import { PostgresqlEventLocker } from '../../../src/postgresql/index.ts';
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
});
