import type { Db } from 'mongodb';
import { MongoEventLocker } from '../../../src/mongodb/MongoEventLocker.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';

describe('MongoEventLocker', () => {

	const testEvent: IEvent = { id: 'evt-1', type: 'TEST_EVENT', payload: {} };

	let eventLocks: Record<string, jest.Mock>;
	let viewLocks: Record<string, jest.Mock>;
	let db: Db;
	let locker: MongoEventLocker;

	beforeEach(() => {
		eventLocks = {
			createIndex: jest.fn().mockResolvedValue('index'),
			updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
			insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
			findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'lock' })
		};
		viewLocks = {
			updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
			findOne: jest.fn().mockResolvedValue(null)
		};

		db = {
			collection: jest.fn((name: string) => (name === 'ncqrs_view_locks' ? viewLocks : eventLocks))
		} as unknown as Db;

		locker = new MongoEventLocker({
			viewModelMongoDb: db,
			projectionName: 'test',
			schemaVersion: '1.0'
		});
	});

	describe('initialize', () => {

		it('creates the lock collections and the processing index', async () => {
			await locker.assertConnection();

			expect(db.collection).toHaveBeenCalledWith('ncqrs_event_locks');
			expect(db.collection).toHaveBeenCalledWith('ncqrs_view_locks');
			expect(eventLocks.createIndex).toHaveBeenCalledWith({ processingAt: 1 }, { sparse: true });
		});

		it('honors optional collection names and lock ttl', async () => {
			const custom = new MongoEventLocker({
				viewModelMongoDb: db,
				projectionName: 'test',
				schemaVersion: '1.0',
				eventLockTtl: 200,
				eventLocksCollection: 'my_event_locks',
				viewLocksCollection: 'my_view_locks'
			});
			await custom.assertConnection();

			expect(db.collection).toHaveBeenCalledWith('my_event_locks');
			expect(db.collection).toHaveBeenCalledWith('my_view_locks');
		});
	});

	describe('tryMarkAsProjecting', () => {

		it('claims an expired lock without inserting', async () => {
			eventLocks.updateOne.mockResolvedValue({ modifiedCount: 1 });

			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
			expect(eventLocks.insertOne).not.toHaveBeenCalled();
		});

		it('inserts a fresh lock when no document matched', async () => {
			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(true);
			expect(eventLocks.insertOne).toHaveBeenCalledWith({
				_id: 'test:1.0:evt-1',
				processingAt: expect.any(Date),
				processedAt: null
			});
		});

		it('returns false when the lock already exists', async () => {
			eventLocks.insertOne.mockRejectedValue({ code: 11000 });

			expect(await locker.tryMarkAsProjecting(testEvent)).toBe(false);
		});

		it('rethrows unexpected insert errors', async () => {
			eventLocks.insertOne.mockRejectedValue(new Error('connection lost'));

			await expect(locker.tryMarkAsProjecting(testEvent)).rejects.toThrow('connection lost');
		});

		it.each([0, 42, { toString: () => 'object-id' }])('builds a lock id from a non-string event id %p', async id => {
			expect(await locker.tryMarkAsProjecting({ id, type: 'TEST_EVENT', payload: {} } as IEvent)).toBe(true);
			expect(eventLocks.insertOne).toHaveBeenCalledWith(expect.objectContaining({
				_id: `test:1.0:${String(id)}`
			}));
		});
	});

	describe('markAsProjected', () => {

		it('finalizes the event lock', async () => {
			await locker.markAsProjected(testEvent);

			expect(eventLocks.findOneAndUpdate).toHaveBeenCalledWith(
				{ _id: 'test:1.0:evt-1', processedAt: null },
				{ $set: { processedAt: expect.any(Date) } }
			);
		});

		it('throws when the event was never locked', async () => {
			eventLocks.findOneAndUpdate.mockResolvedValue(null);

			await expect(locker.markAsProjected(testEvent))
				.rejects.toThrow(`Event ${testEvent.id} could not be marked as processed`);
		});

		it.each([0, 42, { toString: () => 'object-id' }])('finalizes a lock of an event with id %p', async id => {
			await locker.markAsProjected({ id, type: 'TEST_EVENT', payload: {} } as IEvent);

			expect(eventLocks.findOneAndUpdate).toHaveBeenCalledWith(
				{ _id: `test:1.0:${String(id)}`, processedAt: null },
				expect.anything()
			);
		});
	});

	describe('markAsLastEvent / getLastEvent', () => {

		it('stores the last event', async () => {
			await locker.markAsLastEvent(testEvent);

			expect(viewLocks.updateOne).toHaveBeenCalledWith(
				{ _id: 'test:1.0' },
				{
					$set: { lastEvent: JSON.stringify(testEvent) },
					$setOnInsert: { _id: 'test:1.0' }
				},
				{ upsert: true }
			);
		});

		it('returns undefined when no event has been stored', async () => {
			expect(await locker.getLastEvent()).toBeUndefined();

			viewLocks.findOne.mockResolvedValue({ _id: 'test:1.0', lastEvent: null });
			expect(await locker.getLastEvent()).toBeUndefined();
		});

		it.each([0, 42, { toString: () => 'object-id' }])('stores a non-string id %p as a usable cursor', async id => {
			await locker.markAsLastEvent({ id, type: 'TEST_EVENT', payload: {} } as IEvent);

			const [, update] = viewLocks.updateOne.mock.calls[0];
			expect(JSON.parse(update.$set.lastEvent).id).toBe(typeof id === 'object' ? String(id) : id);
		});

		it('parses the stored last event', async () => {
			viewLocks.findOne.mockResolvedValue({ _id: 'test:1.0', lastEvent: JSON.stringify(testEvent) });

			expect(await locker.getLastEvent()).toEqual(testEvent);
		});
	});
});
