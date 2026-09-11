import type { Db } from 'mongodb';
import { AbstractMongoAccessor } from '../../../src/mongodb/AbstractMongoAccessor.ts';

describe('AbstractMongoAccessor', () => {

	class TestAccessor extends AbstractMongoAccessor {
		initializeCalls = 0;

		protected override async initialize(_db: Db): Promise<void> {
			this.initializeCalls += 1;
		}
	}

	it('throws when neither db nor factory is provided', () => {
		expect(() => new TestAccessor({}))
			.toThrow('either viewModelMongoDb or viewModelMongoDbFactory argument required');
	});

	it('initializes only once for concurrent assertConnection() calls', async () => {
		const db = {} as Db;
		let factoryCalls = 0;
		const accessor = new TestAccessor({
			viewModelMongoDbFactory: () => {
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
