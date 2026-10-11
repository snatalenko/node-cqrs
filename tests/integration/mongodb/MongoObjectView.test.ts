import { MongoClient, type Db } from 'mongodb';
import { MongoObjectView, type MongoProjectionDbFactoryParams } from '../../../src/mongodb/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';

const CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING ?? 'mongodb://localhost:27017/node_cqrs_test';

describe('MongoObjectView factory routing (integration)', () => {
	let client: MongoClient;
	const databases = new Map<string, Db>();

	beforeAll(async () => {
		client = new MongoClient(CONNECTION_STRING);
		await client.connect();
		for (const key of ['Users:1', 'Users:2', 'Orders:1'])
			databases.set(key, client.db(`node_cqrs_factory_${process.pid}_${key.replace(':', '_')}`));
	});

	afterAll(async () => {
		await Promise.all([...databases.values()].map(db => db.dropDatabase()));
		await client.close();
	});

	it('uses the selected database for records, checkpoints and restore locks', async () => {
		const factory = jest.fn((params?: MongoProjectionDbFactoryParams) => {
			const db = databases.get(`${params?.projectionName}:${params?.schemaVersion}`);
			if (!db)
				throw new Error('Unknown projection connection');

			return db;
		});
		const event: IEvent = { id: 'shared-event', type: 'TEST', payload: {} };

		for (const [key, db] of databases) {
			const [projectionName, schemaVersion] = key.split(':');
			const view = new MongoObjectView<{ name: string }>({
				viewModelMongoDbFactory: factory,
				projectionName,
				schemaVersion,
				tableNamePrefix: 'items'
			});

			await view.assertConnection();
			await view.create('shared-id', { name: key });
			await view.markAsLastEvent(event);
			await view.lock();
			await view.unlock();

			expect(await view.get('shared-id')).toEqual({ name: key });
			expect(await view.getLastEvent()).toEqual(event);
			expect(await db.collection(`items_${schemaVersion}`).countDocuments()).toBe(1);
			expect(await db.collection('ncqrs_view_locks').findOne({ _id: key } as any))
				.toMatchObject({ lockedTill: null, token: null });
			expect(factory.mock.calls.slice(-4)).toEqual(Array(4).fill([{ projectionName, schemaVersion }]));
		}

		expect(factory).toHaveBeenCalledTimes(12);
	});
});
