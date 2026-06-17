import { PostgresqlObjectView } from '../../../src/postgresql/index.ts';
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
