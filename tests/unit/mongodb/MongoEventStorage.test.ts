import { MongoEventStorage } from '../../../src/mongodb/MongoEventStorage.ts';
import { ConcurrencyError } from '../../../src';
import { ObjectId } from 'mongodb';

function makeObjectId(hex?: string): ObjectId {
	return hex ? new ObjectId(hex) : new ObjectId();
}

function padHex(n: number): string {
	return n.toString(16).padStart(24, '0');
}

describe('MongoEventStorage', () => {

	let storage: MongoEventStorage;
	let mockCollection: {
		createIndex: jest.Mock;
		insertMany: jest.Mock;
		find: jest.Mock;
		findOne: jest.Mock;
	};

	beforeEach(() => {
		jest.clearAllMocks();

		mockCollection = {
			createIndex: jest.fn().mockResolvedValue('index'),
			insertMany: jest.fn().mockResolvedValue({ insertedCount: 0 }),
			find: jest.fn().mockReturnValue({ async* [Symbol.asyncIterator]() {} }),
			findOne: jest.fn().mockResolvedValue(null)
		};

		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
			client: { close: jest.fn().mockResolvedValue(undefined) }
		};

		storage = new MongoEventStorage({ mongoDbFactory: () => mockDb as any });
	});

	describe('constructor', () => {
		it('throws when mongoDbFactory is not a function', () => {
			expect(() => new MongoEventStorage({} as any)).toThrow(TypeError);
			expect(() => new MongoEventStorage({} as any)).toThrow('mongoDbFactory must be a Function');
		});

		it('throws when mongoDbFactory is a string', () => {
			expect(() => new MongoEventStorage({ mongoDbFactory: 'not-a-function' } as any)).toThrow(TypeError);
		});

		it('uses custom collection name from mongoEventStorageConfig', async () => {
			const mockDb = {
				collection: jest.fn().mockReturnValue(mockCollection),
				client: { close: jest.fn() }
			};

			const s = new MongoEventStorage({
				mongoDbFactory: () => mockDb as any,
				mongoEventStorageConfig: { collection: 'custom_events' }
			});

			// Trigger initialization by calling a method
			await s.commitEvents([{ type: 'Test', aggregateId: 'a1', aggregateVersion: 1 } as any]);

			expect(mockDb.collection).toHaveBeenCalledWith('custom_events');
		});

		it('defaults collection name to EVENTS_COLLECTION', async () => {
			const mockDb = {
				collection: jest.fn().mockReturnValue(mockCollection),
				client: { close: jest.fn() }
			};

			const s = new MongoEventStorage({ mongoDbFactory: () => mockDb as any });

			await s.commitEvents([{ type: 'Test', aggregateId: 'a1', aggregateVersion: 1 } as any]);

			expect(mockDb.collection).toHaveBeenCalledWith(MongoEventStorage.EVENTS_COLLECTION);
		});
	});

	describe('getNewId', () => {
		it('returns a 24-char hex string', () => {
			const id = storage.getNewId();
			expect(typeof id).toBe('string');
			expect(id).toMatch(/^[0-9a-f]{24}$/);
		});

		it('returns unique ids', () => {
			const id1 = storage.getNewId();
			const id2 = storage.getNewId();
			expect(id1).not.toBe(id2);
		});
	});

	describe('commitEvents', () => {
		it('inserts events and assigns ids back', async () => {
			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };

			mockCollection.insertMany.mockImplementation(async (docs: any[]) => ({ insertedCount: docs.length }));

			const result = await storage.commitEvents([event as any]);

			expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
			expect(typeof (result[0] as any).id).toBe('string');
			expect((result[0] as any).id).toMatch(/^[0-9a-f]{24}$/);
		});

		it('converts aggregateId to ObjectId when it is a 24-char hex string', async () => {
			const aggregateId = padHex(1);
			const event = { type: 'UserCreated', aggregateId, aggregateVersion: 1 };

			mockCollection.insertMany.mockImplementation(async (docs: any[]) => {
				expect(docs[0].aggregateId).toBeInstanceOf(ObjectId);
				expect(docs[0].aggregateId.toHexString()).toBe(aggregateId);
				return { insertedCount: docs.length };
			});

			await storage.commitEvents([event as any]);
		});

		it('throws ConcurrencyError on duplicate key error (code 11000)', async () => {
			const error = Object.assign(new Error('duplicate key'), { code: 11000 });
			mockCollection.insertMany.mockRejectedValue(error);

			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };

			await expect(storage.commitEvents([event as any])).rejects.toBeInstanceOf(ConcurrencyError);
		});

		it('throws when ignoreConcurrencyError is true', async () => {
			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };

			await expect(
				storage.commitEvents([event as any], { ignoreConcurrencyError: true })
			).rejects.toThrow('ignoreConcurrencyError is not supported by MongoEventStorage');
		});

		it('rethrows non-concurrency errors', async () => {
			const error = new Error('connection lost');
			mockCollection.insertMany.mockRejectedValue(error);

			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };

			await expect(storage.commitEvents([event as any])).rejects.toThrow('connection lost');
		});
	});

	describe('getAggregateEvents', () => {
		it('queries by aggregateId and yields mapped events', async () => {
			const aggId = padHex(1);
			const docId = padHex(100);

			mockCollection.find.mockReturnValue({
				async* [Symbol.asyncIterator]() {
					yield {
						_id: makeObjectId(docId),
						type: 'UserCreated',
						aggregateId: makeObjectId(aggId),
						aggregateVersion: 1
					};
				}
			});

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents(aggId))
				results.push(e);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(docId);
			expect(results[0].aggregateId).toBe(aggId);
			expect(results[0].type).toBe('UserCreated');
			expect(results[0]._id).toBeUndefined();
		});

		it('adds aggregateVersion $gt filter when snapshot is provided', async () => {
			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });

			const snapshot = { type: 'snapshot' as const, aggregateVersion: 5, payload: {} };
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of storage.getAggregateEvents('agg1', { snapshot }))
				;

			const [filter] = mockCollection.find.mock.calls[0];
			expect(filter.aggregateVersion).toEqual({ $gt: 5 });
		});

		it('adds type $in filter when eventTypes is provided', async () => {
			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of storage.getAggregateEvents('agg1', { eventTypes: ['UserCreated'] }))
				;

			const [filter] = mockCollection.find.mock.calls[0];
			expect(filter.type).toEqual({ $in: ['UserCreated'] });
		});

		it('fetches tail event separately when tail=last and type filter is active', async () => {
			const tailId = padHex(99);
			const tailDoc = {
				_id: makeObjectId(tailId),
				type: 'SomeOtherEvent',
				aggregateId: 'agg1',
				aggregateVersion: 9
			};

			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });
			mockCollection.findOne.mockResolvedValue(tailDoc);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents('agg1', { eventTypes: ['UserCreated'], tail: 'last' }))
				results.push(e);

			expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(tailId);
		});

		it('does not duplicate tail event when it was already yielded', async () => {
			const sharedId = padHex(10);
			const doc = {
				_id: makeObjectId(sharedId),
				type: 'UserCreated',
				aggregateId: 'agg1',
				aggregateVersion: 1
			};

			mockCollection.find.mockReturnValue({
				async* [Symbol.asyncIterator]() {
					yield doc;
				}
			});
			mockCollection.findOne.mockResolvedValue(doc);

			const results: any[] = [];
			for await (const e of storage.getAggregateEvents('agg1', { eventTypes: ['UserCreated'], tail: 'last' }))
				results.push(e);

			expect(results).toHaveLength(1);
		});
	});

	describe('getSagaEvents', () => {
		it('throws when beforeEvent.id is missing', async () => {
			const stream = storage.getSagaEvents('SagaA:originId', { beforeEvent: { type: 'x' } } as any);
			await expect(stream.next()).rejects.toThrow(TypeError);
		});

		it('throws when beforeEvent.sagaOrigins does not match sagaId', async () => {
			const beforeEvent = { id: padHex(2), type: 'x', sagaOrigins: { SagaA: 'differentOrigin' } };
			const stream = storage.getSagaEvents(`SagaA:${padHex(1)}`, { beforeEvent });
			await expect(stream.next()).rejects.toThrow('beforeEvent.sagaOrigins does not match sagaId');
		});

		it('queries with $or filter matching origin event and sagaOrigins range', async () => {
			const originId = padHex(1);
			const beforeId = padHex(10);

			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });

			const beforeEvent = {
				id: beforeId,
				type: 'x',
				sagaOrigins: { SagaA: originId }
			};

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of storage.getSagaEvents(`SagaA:${originId}`, { beforeEvent }))
				;

			const [filter] = mockCollection.find.mock.calls[0];
			expect(filter.$or).toHaveLength(2);
			expect(filter.$or[0]._id.toHexString()).toBe(originId);
			expect(filter.$or[1]['sagaOrigins.SagaA']).toBe(originId);
			expect(filter.$or[1]._id.$gt.toHexString()).toBe(originId);
			expect(filter.$or[1]._id.$lt.toHexString()).toBe(beforeId);
		});

		it('yields events from the cursor', async () => {
			const originId = padHex(1);
			const beforeId = padHex(10);
			const eventId = padHex(5);

			mockCollection.find.mockReturnValue({
				async* [Symbol.asyncIterator]() {
					yield {
						_id: makeObjectId(eventId),
						type: 'SagaEvent',
						sagaOrigins: { SagaA: originId }
					};
				}
			});

			const beforeEvent = { id: beforeId, type: 'x', sagaOrigins: { SagaA: originId } };
			const results: any[] = [];
			for await (const e of storage.getSagaEvents(`SagaA:${originId}`, { beforeEvent }))
				results.push(e);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(eventId);
		});
	});

	describe('getEventsByTypes', () => {
		it('throws when afterEvent is provided without id', async () => {
			const stream = storage.getEventsByTypes(['UserCreated'], { afterEvent: { type: 'x' } });
			await expect(stream.next()).rejects.toThrow('options.afterEvent.id must be a non-empty String');
		});

		it('queries with type $in filter', async () => {
			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of storage.getEventsByTypes(['UserCreated', 'UserUpdated']))
				;

			const [filter] = mockCollection.find.mock.calls[0];
			expect(filter.type).toEqual({ $in: ['UserCreated', 'UserUpdated'] });
		});

		it('adds _id $gt filter when afterEvent is provided', async () => {
			const afterId = padHex(5);
			mockCollection.find.mockReturnValue({ async* [Symbol.asyncIterator]() {} });

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of storage.getEventsByTypes(['UserCreated'], { afterEvent: { id: afterId, type: 'x' } }))
				;

			const [filter] = mockCollection.find.mock.calls[0];
			expect(filter._id.$gt.toHexString()).toBe(afterId);
		});

		it('yields events from cursor', async () => {
			const docId = padHex(1);
			mockCollection.find.mockReturnValue({
				async* [Symbol.asyncIterator]() {
					yield { _id: makeObjectId(docId), type: 'UserCreated' };
				}
			});

			const results: any[] = [];
			for await (const e of storage.getEventsByTypes(['UserCreated']))
				results.push(e);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(docId);
			expect(results[0].type).toBe('UserCreated');
		});
	});

	describe('process', () => {
		it('throws when batch item does not contain event', async () => {
			await expect(storage.process([{}] as any)).rejects.toThrow('Event batch does not contain `event`');
		});

		it('commits events from batch and returns batch', async () => {
			mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };
			const batch = [{ event }];
			const result = await storage.process(batch as any);

			expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
			expect(result).toBe(batch);
		});

		it('propagates ConcurrencyError from commitEvents', async () => {
			const error = Object.assign(new Error('duplicate key'), { code: 11000 });
			mockCollection.insertMany.mockRejectedValue(error);

			const event = { type: 'UserCreated', aggregateId: 'agg1', aggregateVersion: 1 };
			const batch = [{ event }];

			await expect(storage.process(batch as any)).rejects.toBeInstanceOf(ConcurrencyError);
		});
	});
});
