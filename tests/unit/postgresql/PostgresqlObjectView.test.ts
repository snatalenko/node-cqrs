import { PostgresqlObjectView, type PostgresqlProjectionDbFactoryParams } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('PostgresqlObjectView', () => {

	let db: MockPostgresqlConnection;
	let view: PostgresqlObjectView<{ name: string }>;

	beforeEach(() => {
		db = new MockPostgresqlConnection();
		view = new PostgresqlObjectView({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			tableNamePrefix: 'users'
		});
	});

	it('resolves the same connection for a projection view, its storage, and its locks', async () => {
		const pools = new Map([
			['Users:1', new MockPostgresqlConnection()],
			['Users:2', new MockPostgresqlConnection()],
			['Orders:1', new MockPostgresqlConnection()]
		]);
		const factory = jest.fn((params?: PostgresqlProjectionDbFactoryParams) => {
			if (!params)
				throw new Error('Projection context required');

			return pools.get(`${params.projectionName}:${params.schemaVersion}`)!;
		});

		for (const [key, pool] of pools) {
			const [projectionName, schemaVersion] = key.split(':');
			const factoryView = new PostgresqlObjectView<{ name: string }>({
				viewModelPostgresqlDbFactory: factory,
				projectionName,
				schemaVersion,
				tableNamePrefix: 'records'
			});

			await factoryView.runInTransaction(() => factoryView.create('1', { name: key }));

			expect(await factoryView.get('1')).toEqual({ name: key });
			expect(pool.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(pool.connectCount).toBe(1);
		}

		expect(factory.mock.calls).toEqual([
			...Array(4).fill([{ projectionName: 'Users', schemaVersion: '1' }]),
			...Array(4).fill([{ projectionName: 'Users', schemaVersion: '2' }]),
			...Array(4).fill([{ projectionName: 'Orders', schemaVersion: '1' }])
		]);
	});

	it('creates db connection from viewModelPostgresqlDbFactory when db is not provided', async () => {
		const factoryView = new PostgresqlObjectView<{ name: string }>({
			viewModelPostgresqlDbFactory: () => db,
			projectionName: 'test',
			schemaVersion: '1',
			tableNamePrefix: 'users'
		});

		await factoryView.create('1', { name: 'Alice' });
		expect(await factoryView.get('1')).toEqual({ name: 'Alice' });
	});

	it('requires tableNamePrefix', () => {
		expect(() => new PostgresqlObjectView({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1'
		} as any)).toThrow('tableNamePrefix must be a non-empty String');
	});

	it('creates and reads a record', async () => {
		await view.create('1', { name: 'Alice' });
		expect(await view.get('1')).toEqual({ name: 'Alice' });
	});

	it('waits for ready before reading', async () => {
		await view.create('1', { name: 'Alice' });
		await view.lock();

		let resolved = false;
		const p = view.get('1').then(result => {
			resolved = true;
			return result;
		});

		expect(resolved).toBe(false);
		await view.unlock();

		await expect(p).resolves.toEqual({ name: 'Alice' });
		expect(resolved).toBe(true);
	});

	it('updates an existing record', async () => {
		await view.create('1', { name: 'Alice' });
		await view.update('1', r => ({ ...r, name: 'Bob' }));

		expect(await view.get('1')).toEqual({ name: 'Bob' });
	});

	it('updateEnforcingNew creates a missing record', async () => {
		await view.updateEnforcingNew('1', () => ({ name: 'Alice' }));
		expect(await view.get('1')).toEqual({ name: 'Alice' });
	});

	it('deletes records', async () => {
		await view.create('1', { name: 'Alice' });

		expect(await view.delete('1')).toBe(true);
		expect(await view.get('1')).toBeUndefined();
	});
});
