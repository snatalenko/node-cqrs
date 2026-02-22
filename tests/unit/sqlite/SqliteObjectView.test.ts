import { expect } from 'chai';
import createDb from 'better-sqlite3';
import { SqliteObjectView } from '../../../src/sqlite';
import { promisify } from 'util';
const delay = promisify(setTimeout);

describe('SqliteObjectView', function () {
	let viewModelSqliteDb: import('better-sqlite3').Database;
	let sqliteObjectView: SqliteObjectView<any>;

	beforeEach(() => {
		viewModelSqliteDb = createDb(':memory:');
		sqliteObjectView = new SqliteObjectView({
			viewModelSqliteDb,
			projectionName: 'test',
			tableNamePrefix: 'tbl_test',
			schemaVersion: '1'
		});
	});

	describe('getSync', () => {

		it('returns stored record', async () => {
			await sqliteObjectView.create('1', { foo: 'bar' });
			expect(sqliteObjectView.getSync('1')).to.eql({ foo: 'bar' });
		});

		it('returns undefined if record does not exist', async () => {
			await sqliteObjectView.get('missing'); // ensures connection is initialized
			expect(sqliteObjectView.getSync('missing')).to.eq(undefined);
		});
	});

	describe('get', () => {

		it('throws an error if id is not a non-empty string', async () => {

			let error;
			try {
				error = null;
				await sqliteObjectView.get('');
			}
			catch (err) {
				error = err;
			}
			expect(error).to.exist;
			expect(error).to.have.property('message', 'id must be a non-empty String');
		});

		it('waits for readiness before returning data', async () => {

			await sqliteObjectView.lock();

			expect(sqliteObjectView).to.have.property('ready', false);

			let resultObtained = false;
			const resultPromise = sqliteObjectView.get('test').then(() => {
				resultObtained = true;
			});

			await delay(5);
			expect(resultObtained).to.eq(false);

			sqliteObjectView.unlock();


			await resultPromise;
			expect(resultObtained).to.eq(true);
		});

		it('returns stored record if ready', async () => {

			sqliteObjectView.create('1', { foo: 'bar' });

			const r = await sqliteObjectView.get('1');
			expect(r).to.eql({ foo: 'bar' });
		});

		it('returns undefined if record does not exist', async () => {

			const r = await sqliteObjectView.get('1');
			expect(r).to.eql(undefined);
		});
	});

	describe('create', () => {

		it('stores a record retrievable by id', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			expect(await sqliteObjectView.get('1')).to.eql({ name: 'Alice' });
		});

		it('throws if record with the same id already exists', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });

			let error = null;
			try {
				await sqliteObjectView.create('1', { name: 'Bob' });
			}
			catch (err) {
				error = err;
			}
			expect(error).to.exist;
		});
	});

	describe('update', () => {

		it('updates an existing record', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			await sqliteObjectView.update('1', r => ({ ...r, name: 'Bob' }));
			expect(await sqliteObjectView.get('1')).to.eql({ name: 'Bob' });
		});

		it('throws if record does not exist', async () => {
			let error = null;
			try {
				await sqliteObjectView.update('missing', r => r);
			}
			catch (err) {
				error = err;
			}
			expect(error).to.exist;
		});
	});

	describe('updateEnforcingNew', () => {

		it('creates a new record if it does not exist', async () => {
			await sqliteObjectView.updateEnforcingNew('1', () => ({ name: 'Alice' }));
			expect(await sqliteObjectView.get('1')).to.eql({ name: 'Alice' });
		});

		it('updates an existing record', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			await sqliteObjectView.updateEnforcingNew('1', r => ({ ...r!, name: 'Bob' }));
			expect(await sqliteObjectView.get('1')).to.eql({ name: 'Bob' });
		});
	});

	describe('delete', () => {

		it('removes an existing record and returns true', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			const result = await sqliteObjectView.delete('1');
			expect(result).to.eq(true);
			expect(await sqliteObjectView.get('1')).to.eq(undefined);
		});

		it('returns false when record does not exist', async () => {
			const result = await sqliteObjectView.delete('missing');
			expect(result).to.eq(false);
		});
	});
});
