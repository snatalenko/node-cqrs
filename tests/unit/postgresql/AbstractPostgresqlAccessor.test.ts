import {
	AbstractPostgresqlAccessor,
	type PostgresqlConnection
} from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

class TestAccessor extends AbstractPostgresqlAccessor {

	protected override initialize(_db: PostgresqlConnection) { }

	get currentConnection() {
		return this.connection;
	}

	runAfterCommit(callback: () => void) {
		this.afterCommit(callback);
	}
}

describe('AbstractPostgresqlAccessor', () => {

	describe('runInTransaction', () => {

		let pool: MockPostgresqlConnection;
		let accessor: TestAccessor;

		beforeEach(() => {
			pool = new MockPostgresqlConnection();
			accessor = new TestAccessor({ viewModelPostgresqlDb: pool });
		});

		it('shares the transaction with accessors using the same pool', async () => {
			const otherAccessor = new TestAccessor({ viewModelPostgresqlDb: pool });
			await otherAccessor.assertConnection();

			await accessor.runInTransaction(() => {
				expect(otherAccessor.currentConnection).toBe(accessor.currentConnection);
				expect(otherAccessor.currentConnection).not.toBe(pool);
			});
		});

		it('joins the transaction, when started by another accessor using the same pool', async () => {
			const otherAccessor = new TestAccessor({ viewModelPostgresqlDb: pool });

			await accessor.runInTransaction(() => otherAccessor.runInTransaction(() => { }));

			expect(pool.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(pool.connectCount).toBe(1);
		});

		it('does not share the transaction with accessors using another pool', async () => {
			const otherPool = new MockPostgresqlConnection();
			const otherAccessor = new TestAccessor({ viewModelPostgresqlDb: otherPool });
			await otherAccessor.assertConnection();

			await accessor.runInTransaction(async () => {
				expect(otherAccessor.currentConnection).toBe(otherPool);

				await otherAccessor.runInTransaction(() => { });
			});

			expect(pool.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(otherPool.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		});

		it('uses the pool outside of a transaction', async () => {
			await accessor.assertConnection();

			expect(accessor.currentConnection).toBe(pool);
		});
	});

	describe('assertConnection', () => {

		let pool: MockPostgresqlConnection;
		let accessor: TestAccessor;
		let initialize: jest.SpyInstance;

		beforeEach(() => {
			pool = new MockPostgresqlConnection();
			accessor = new TestAccessor({ viewModelPostgresqlDb: pool });
			initialize = jest.spyOn(accessor as any, 'initialize');
		});

		it('repeats initialization failed by concurrent creation of the same objects', async () => {
			initialize.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

			await accessor.assertConnection();

			expect(initialize).toHaveBeenCalledTimes(2);
		});

		it('does not repeat initialization failed by other errors', async () => {
			initialize.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: '42501' }));

			await expect(accessor.assertConnection()).rejects.toThrow('permission denied');

			expect(initialize).toHaveBeenCalledTimes(1);
		});

		it('initializes on the transaction connection once per transaction', async () => {
			const owner = new TestAccessor({ viewModelPostgresqlDb: pool });

			await owner.runInTransaction(async () => {
				await accessor.assertConnection();
				await accessor.assertConnection();

				expect(initialize).toHaveBeenCalledTimes(1);
				expect(initialize).toHaveBeenCalledWith(owner.currentConnection);
			});

			await accessor.assertConnection();
			expect(initialize).toHaveBeenCalledTimes(1);
		});

		it('initializes again after the transaction it initialized in is rolled back', async () => {
			const owner = new TestAccessor({ viewModelPostgresqlDb: pool });

			await expect(owner.runInTransaction(async () => {
				await accessor.assertConnection();
				throw new Error('failed');
			})).rejects.toThrow('failed');

			await accessor.assertConnection();

			expect(initialize).toHaveBeenCalledTimes(2);
			expect(initialize).toHaveBeenLastCalledWith(pool);
		});
	});

	describe('with a connection checked out of a pool', () => {

		it('runs transactions on it without reconnecting or releasing it', async () => {
			const pool = new MockPostgresqlConnection();
			const client = Object.assign(await pool.connect(), { connect: jest.fn() });
			const accessor = new TestAccessor({ viewModelPostgresqlDb: client });

			await accessor.runInTransaction(() => {
				expect(accessor.currentConnection).toBe(client);
			});

			expect(client.connect).not.toHaveBeenCalled();
			expect(pool.releaseCount).toBe(0);
			expect(pool.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		});
	});

	describe('afterCommit', () => {

		let pool: MockPostgresqlConnection;
		let accessor: TestAccessor;

		beforeEach(() => {
			pool = new MockPostgresqlConnection();
			accessor = new TestAccessor({ viewModelPostgresqlDb: pool });
		});

		it('runs callbacks after the transaction is committed', async () => {
			const callback = jest.fn(() => expect(pool.transactionLog).toEqual(['BEGIN', 'COMMIT']));

			await accessor.runInTransaction(() => {
				accessor.runAfterCommit(callback);
				expect(callback).not.toHaveBeenCalled();
			});

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('discards callbacks of rolled back transactions', async () => {
			const callback = jest.fn();

			await expect(accessor.runInTransaction(() => {
				accessor.runAfterCommit(callback);
				throw new Error('failed');
			})).rejects.toThrow('failed');

			expect(callback).not.toHaveBeenCalled();
		});

		it('runs callbacks immediately outside of a transaction', async () => {
			const callback = jest.fn();
			await accessor.assertConnection();

			accessor.runAfterCommit(callback);

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('runs callbacks immediately within a transaction of another pool', async () => {
			const otherAccessor = new TestAccessor({ viewModelPostgresqlDb: new MockPostgresqlConnection() });
			await otherAccessor.assertConnection();
			const callback = jest.fn();

			await accessor.runInTransaction(() => {
				otherAccessor.runAfterCommit(callback);
				expect(callback).toHaveBeenCalledTimes(1);
			});
		});
	});

	it('initializes only once when concurrent callers wait on the same initialization lock', async () => {
		let releaseInitialization!: () => void;
		let initializationStarted!: () => void;

		class Accessor extends AbstractPostgresqlAccessor {
			initializeCalls = 0;
			readonly initializationStarted = new Promise<void>(resolve => {
				initializationStarted = resolve;
			});
			readonly initializationCanFinish = new Promise<void>(resolve => {
				releaseInitialization = resolve;
			});

			override async initialize(_db: PostgresqlConnection) {
				this.initializeCalls++;
				initializationStarted();
				await this.initializationCanFinish;
			}
		}

		const accessor = new Accessor({
			viewModelPostgresqlDb: new MockPostgresqlConnection()
		});

		const firstAssertion = accessor.assertConnection();
		await accessor.initializationStarted;
		const secondAssertion = accessor.assertConnection();

		releaseInitialization();
		await Promise.all([firstAssertion, secondAssertion]);

		expect(accessor.initializeCalls).toBe(1);
	});
});
