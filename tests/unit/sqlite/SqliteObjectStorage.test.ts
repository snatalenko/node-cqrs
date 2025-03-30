import { expect } from 'chai';
import * as createDb from 'better-sqlite3';
import { guid, SqliteObjectStorage } from '../../../src/sqlite';

describe('SqliteObjectStorage', function () {
	let db: import('better-sqlite3').Database;
	let storage: SqliteObjectStorage<{ name: string; value: number }>;

	beforeEach(() => {
		db = createDb(':memory:');
		storage = new SqliteObjectStorage<{ name: string; value: number }>({
			viewModelSqliteDb: db,
			tableName: 'test_objects',
		});
	});

	afterEach(() => {
		db.close();
	});

	it('stores and retrieves an object', async function () {

		const obj = { name: 'Test Object', value: 42 };
		storage.create('0001', obj);

		const retrieved = storage.get('0001');
		expect(retrieved).to.deep.equal(obj);
	});

	it('returns undefined for a non-existent object', async function () {
		const retrieved = storage.get('nonexistent');
		expect(retrieved).to.be.undefined;
	});

	it('updates an existing object', async function () {

		storage.create('0002', { name: 'Old Data', value: 5 });

		storage.update('0002', (r) => ({ ...r, value: 99 }));

		const updated = storage.get('0002');
		expect(updated).to.deep.equal({ name: 'Old Data', value: 99 });
	});

	it('throws an error when updating a non-existent object', async function () {

		expect(() => storage.update('nonexistent', (r) => ({ ...r, value: 99 })))
			.to.throw(Error, "Record 'nonexistent' does not exist");
	});

	it('deletes an object', async function () {

		storage.create('0003', { name: 'To be deleted', value: 10 });
		const deleted = storage.delete('0003');
		expect(deleted).to.be.true;

		const retrieved = storage.get('0003');
		expect(retrieved).to.be.undefined;
	});

	it('returns false when deleting a non-existent object', async function () {

		const deleted = storage.delete('0000');
		expect(deleted).to.be.false;
	});

	it('enforces updating or creating a new object', async function () {

		storage.updateEnforcingNew('0004', () => ({ name: 'Created', value: 1 }));

		let retrieved = storage.get('0004');
		expect(retrieved).to.deep.equal({ name: 'Created', value: 1 });

		storage.updateEnforcingNew('0004', (r) => ({ ...r!, value: 100 }));

		retrieved = storage.get('0004');
		expect(retrieved).to.deep.equal({ name: 'Created', value: 100 });
	});

	it('fails if invalid JSON is recorded', async function () {
		db.prepare('INSERT INTO test_objects (id, data) VALUES (?, ?)')
			.run(guid('0005'), 'INVALID_JSON');

		expect(() => storage.get('0005')).to.throw();
	});
});
