import { PostgresqlObjectStorage } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('PostgresqlObjectStorage', () => {

	let db: MockPostgresqlConnection;
	let storage: PostgresqlObjectStorage<{ name: string }>;

	beforeEach(() => {
		db = new MockPostgresqlConnection();
		storage = new PostgresqlObjectStorage({
			viewModelPostgresqlDb: db,
			tableName: 'test_records'
		});
	});

	it('creates db connection from viewModelPostgresqlDbFactory when db is not provided', async () => {
		const factoryStorage = new PostgresqlObjectStorage({
			viewModelPostgresqlDbFactory: () => db,
			tableName: 'test_records'
		});

		await factoryStorage.create('1', { name: 'Alice' });
		expect(await factoryStorage.get('1')).toEqual({ name: 'Alice' });
	});

	it('requires a db or factory', () => {
		expect(() => new PostgresqlObjectStorage({
			tableName: 'test_records'
		} as any)).toThrow('either viewModelPostgresqlDb or viewModelPostgresqlDbFactory argument required');
	});

	it('rejects invalid table names', () => {
		expect(() => new PostgresqlObjectStorage({
			viewModelPostgresqlDb: db,
			tableName: 'bad-table-name'
		})).toThrow('Invalid PostgreSQL identifier: bad-table-name');
	});

	it('validates maxRetries', () => {
		expect(() => new PostgresqlObjectStorage({
			viewModelPostgresqlDb: db,
			tableName: 'test_records',
			maxRetries: -1
		})).toThrow('maxRetries must be a non-negative integer');
	});

	it('creates and reads a record', async () => {
		await storage.create('1', { name: 'Alice' });
		expect(await storage.get('1')).toEqual({ name: 'Alice' });
	});

	it('parses stringified json data returned by a PostgreSQL client', async () => {
		db.objectRecords.set('1', {
			data: JSON.stringify({ name: 'Alice' }),
			version: 1
		});

		expect(await storage.get('1')).toEqual({ name: 'Alice' });
	});

	it('returns undefined for a missing record', async () => {
		expect(await storage.get('missing')).toBeUndefined();
	});

	it('throws when creating duplicate record', async () => {
		await storage.create('1', { name: 'Alice' });

		await expect(() => storage.create('1', { name: 'Bob' }))
			.rejects.toThrow("Record '1' could not be created");
	});

	it('updates an existing record', async () => {
		await storage.create('1', { name: 'Alice' });
		await storage.update('1', r => ({ ...r, name: 'Bob' }));

		expect(await storage.get('1')).toEqual({ name: 'Bob' });
	});

	it('throws when updating a missing record', async () => {
		await expect(() => storage.update('missing', r => r))
			.rejects.toThrow("Record 'missing' does not exist");
	});

	it('throws when update cannot commit after max retries', async () => {
		db.forceObjectUpdateConflict = true;
		const lowRetryStorage = new PostgresqlObjectStorage({
			viewModelPostgresqlDb: db,
			tableName: 'test_records',
			maxRetries: 0
		});

		await lowRetryStorage.create('1', { name: 'Alice' });

		await expect(() => lowRetryStorage.update('1', r => ({ ...r, name: 'Bob' })))
			.rejects.toThrow("Record '1' could not be updated after 0 retries");
	});

	it('updateEnforcingNew creates a missing record', async () => {
		await storage.updateEnforcingNew('1', () => ({ name: 'Alice' }));
		expect(await storage.get('1')).toEqual({ name: 'Alice' });
	});

	it('updateEnforcingNew updates an existing record', async () => {
		await storage.create('1', { name: 'Alice' });
		await storage.updateEnforcingNew('1', r => ({ ...r!, name: 'Bob' }));

		expect(await storage.get('1')).toEqual({ name: 'Bob' });
	});

	it('throws when updateEnforcingNew cannot commit after max retries', async () => {
		db.forceObjectUpdateConflict = true;
		const lowRetryStorage = new PostgresqlObjectStorage({
			viewModelPostgresqlDb: db,
			tableName: 'test_records',
			maxRetries: 0
		});

		await lowRetryStorage.create('1', { name: 'Alice' });

		await expect(() => lowRetryStorage.updateEnforcingNew('1', r => ({ ...r!, name: 'Bob' })))
			.rejects.toThrow("Record '1' could not be upserted after 0 retries");
	});

	it('deletes an existing record', async () => {
		await storage.create('1', { name: 'Alice' });

		const result = await storage.delete('1');

		expect(result).toBe(true);
		expect(await storage.get('1')).toBeUndefined();
	});

	it('returns false when deleting a missing record', async () => {
		const result = await storage.delete('missing');
		expect(result).toBe(false);
	});
});
