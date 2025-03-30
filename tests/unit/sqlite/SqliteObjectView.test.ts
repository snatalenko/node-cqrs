import { expect } from 'chai';
import * as createDb from 'better-sqlite3';
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
		})
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
			expect(error).to.have.property('message', 'id argument must be a non-empty String');

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
});
