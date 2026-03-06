import createDb from 'better-sqlite3';
import { guid, SqliteObjectStorage } from '../../../src/sqlite';

describe('SqliteObjectStorage', function () {
	let db: import('better-sqlite3').Database;
	let storage: SqliteObjectStorage<{ name: string; value: number }>;

	beforeEach(async () => {
		db = createDb(':memory:');
		storage = new SqliteObjectStorage<{ name: string; value: number }>({
			viewModelSqliteDb: db,
			tableName: 'test_objects'
		});
		await storage.assertConnection();
	});

	afterEach(() => {
		db.close();
	});

	it('stores and retrieves an object', async function () {

		const obj = { name: 'Test Object', value: 42 };
		await storage.create('0001', obj);

		const retrieved = await storage.get('0001');
		expect(retrieved).toEqual(obj);
	});

	it('returns undefined for a non-existent object', async function () {
		const retrieved = await storage.get('nonexistent');
		expect(retrieved).not.toBeDefined();
	});

	it('updates an existing object', async function () {

		await storage.create('0002', { name: 'Old Data', value: 5 });

		await storage.update('0002', r => ({ ...r, value: 99 }));

		const updated = await storage.get('0002');
		expect(updated).toEqual({ name: 'Old Data', value: 99 });
	});

	it('throws an error when updating a non-existent object', async function () {

		await expect(() => storage.update('nonexistent', r => ({ ...r, value: 99 })))
			.rejects.toThrow("Record 'nonexistent' does not exist");
	});

	it('deletes an object', async function () {

		storage.create('0003', { name: 'To be deleted', value: 10 });
		const deleted = storage.delete('0003');
		expect(deleted).toBeTruthy();

		const retrieved = storage.get('0003');
		expect(retrieved).toBeDefined();
	});

	it('returns false when deleting a non-existent object', async function () {

		const deleted = await storage.delete('0000');
		expect(deleted).toBeFalsy();
	});

	it('enforces updating or creating a new object', async function () {

		await storage.updateEnforcingNew('0004', () => ({ name: 'Created', value: 1 }));

		let retrieved = await storage.get('0004');
		expect(retrieved).toEqual({ name: 'Created', value: 1 });

		await storage.updateEnforcingNew('0004', r => ({ ...r!, value: 100 }));

		retrieved = await storage.get('0004');
		expect(retrieved).toEqual({ name: 'Created', value: 100 });
	});

	it('fails if invalid JSON is recorded', async function () {
		db.prepare('INSERT INTO test_objects (id, data) VALUES (?, ?)')
			.run(guid('0005'), 'INVALID_JSON');

		await expect(() => storage.get('0005')).rejects.toThrow();
	});

	it('updateEnforcingNew is safe under same-process concurrency', async function () {
		const id = '00000000000000000000000000000001';
		const concurrency = 50;

		const results = await Promise.allSettled(
			Array.from({ length: concurrency }, () => storage.updateEnforcingNew(id, r => ({
				name: 'counter',
				value: (r?.value ?? 0) + 1
			})))
		);

		const rejected = results.filter(r => r.status === 'rejected');
		expect(rejected).toEqual([]);

		const record = await storage.get(id);
		expect(record).toEqual({ name: 'counter', value: concurrency });

		const row = db.prepare(`
			SELECT version
			FROM test_objects
			WHERE id = ?
		`).get(guid(id)) as { version: number } | undefined;

		expect(row?.version).toBe(concurrency);
	});

	it('throws if create() affects no rows', async () => {
		db.exec(`
			CREATE TRIGGER test_objects_ignore_insert
			BEFORE INSERT ON test_objects
			BEGIN
				SELECT RAISE(IGNORE);
			END;
		`);

		await expect(() => storage.create('0006', { name: 'ignored', value: 1 }))
			.rejects.toThrow("Record '0006' could not be created");
	});

	it('throws if record version changed before update commit', async () => {
		await storage.create('0007', { name: 'conflict', value: 1 });

		await expect(() => storage.update('0007', r => {
			db.prepare('UPDATE test_objects SET version = version + 1 WHERE id = ?')
				.run(guid('0007'));
			return { ...r, value: 2 };
		})).rejects.toThrow("Record '0007' could not be updated");
	});
});
