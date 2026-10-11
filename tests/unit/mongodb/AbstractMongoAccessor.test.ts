import type { Db } from 'mongodb';
import { AbstractMongoAccessor } from '../../../src/mongodb/AbstractMongoAccessor.ts';

describe('AbstractMongoAccessor', () => {

	class TestAccessor<TFactoryParams extends object = object> extends AbstractMongoAccessor<TFactoryParams> {
		initializeCalls = 0;

		protected override async initialize(_db: Db): Promise<void> {
			this.initializeCalls += 1;
		}
	}

	it.each([undefined, { databaseName: 'tenant_views' }])('passes optional factory params unchanged: %p', async params => {
		const factory = jest.fn((_params?: { databaseName: string }) => ({} as Db));
		const accessor = new TestAccessor({
			mongoDbFactory: factory,
			mongoDbFactoryParams: params
		});

		await accessor.assertConnection();

		expect(factory).toHaveBeenCalledWith(params);
		expect(factory.mock.calls[0][0]).toBe(params);
	});

	it('throws when neither db nor factory is provided', () => {
		expect(() => new TestAccessor({}))
			.toThrow('either mongoDb or mongoDbFactory argument required');
	});

	it('initializes only once for concurrent assertConnection() calls', async () => {
		const db = {} as Db;
		let factoryCalls = 0;
		const accessor = new TestAccessor({
			mongoDbFactory: () => {
				factoryCalls += 1;
				return db;
			}
		});

		await Promise.all([accessor.assertConnection(), accessor.assertConnection()]);
		await accessor.assertConnection();

		expect(factoryCalls).toBe(1);
		expect(accessor.initializeCalls).toBe(1);
	});
});
