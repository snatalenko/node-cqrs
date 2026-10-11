import type { Db } from 'mongodb';
import { MongoObjectStorage, type MongoProjectionDbFactoryParams } from '../../../src/mongodb/index.ts';

describe('MongoObjectStorage factory params', () => {
	it.each([undefined, { projectionName: 'Users', schemaVersion: '2' }])(
		'forwards optional storage factory params: %p', async params => {
			const collection = { findOne: jest.fn().mockResolvedValue({ data: { name: 'Alice' } }) };
			const db = { collection: jest.fn(() => collection) } as unknown as Db;
			const factory = jest.fn((_params?: MongoProjectionDbFactoryParams) => db);
			const storage = new MongoObjectStorage<{ name: string }>({
				viewModelMongoDbFactory: factory,
				viewModelMongoDbFactoryParams: params,
				tableName: 'users'
			});

			expect(await storage.get('user-id')).toEqual({ name: 'Alice' });
			expect(factory).toHaveBeenCalledWith(params);
			expect(factory.mock.calls[0][0]).toBe(params);
			expect(db.collection).toHaveBeenCalledWith('users');
		}
	);
});
