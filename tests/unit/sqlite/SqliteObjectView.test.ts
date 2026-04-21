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

	afterEach(() => {
		viewModelSqliteDb.close();
	});

	it('creates db connection from viewModelSqliteDbFactory when db is not provided', async () => {
		const db = createDb(':memory:');
		const view = new SqliteObjectView({
			viewModelSqliteDbFactory: () => db,
			projectionName: 'test-factory',
			tableNamePrefix: 'tbl_factory',
			schemaVersion: '1'
		});

		await view.create('1', { foo: 'bar' });
		expect(await view.get('1')).toEqual({ foo: 'bar' });

		db.close();
	});

	it('throws if neither db nor dbFactory are provided', () => {
		expect(() => new SqliteObjectView({
			projectionName: 'test',
			tableNamePrefix: 'tbl_test',
			schemaVersion: '1'
		} as any)).toThrow('either viewModelSqliteDb or viewModelSqliteDbFactory argument required');
	});

	describe('getSync', () => {

		it('returns stored record', async () => {
			await sqliteObjectView.create('1', { foo: 'bar' });
			expect(sqliteObjectView.getSync('1')).toEqual({ foo: 'bar' });
		});

		it('returns undefined if record does not exist', async () => {
			await sqliteObjectView.get('missing'); // ensures connection is initialized
			expect(sqliteObjectView.getSync('missing')).toBe(undefined);
		});
	});

	describe('get', () => {

		it('waits for readiness before returning data', async () => {

			await sqliteObjectView.lock();

			expect(sqliteObjectView).toHaveProperty('ready', false);

			let resultObtained = false;
			const resultPromise = sqliteObjectView.get('test').then(() => {
				resultObtained = true;
			});

			await delay(5);
			expect(resultObtained).toBe(false);

			sqliteObjectView.unlock();


			await resultPromise;
			expect(resultObtained).toBe(true);
		});

		it('returns stored record if ready', async () => {

			sqliteObjectView.create('1', { foo: 'bar' });

			const r = await sqliteObjectView.get('1');
			expect(r).toEqual({ foo: 'bar' });
		});

		it('returns undefined if record does not exist', async () => {

			const r = await sqliteObjectView.get('1');
			expect(r).toEqual(undefined);
		});
	});

	describe('create', () => {

		it('stores a record retrievable by id', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			expect(await sqliteObjectView.get('1')).toEqual({ name: 'Alice' });
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
			expect(error).toBeDefined();
		});
	});

	describe('update', () => {

		it('updates an existing record', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			await sqliteObjectView.update('1', r => ({ ...r, name: 'Bob' }));
			expect(await sqliteObjectView.get('1')).toEqual({ name: 'Bob' });
		});

		it('throws if record does not exist', async () => {
			let error = null;
			try {
				await sqliteObjectView.update('missing', r => r);
			}
			catch (err) {
				error = err;
			}
			expect(error).toBeDefined();
		});
	});

	describe('updateEnforcingNew', () => {

		it('creates a new record if it does not exist', async () => {
			await sqliteObjectView.updateEnforcingNew('1', () => ({ name: 'Alice' }));
			expect(await sqliteObjectView.get('1')).toEqual({ name: 'Alice' });
		});

		it('updates an existing record', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			await sqliteObjectView.updateEnforcingNew('1', r => ({ ...r!, name: 'Bob' }));
			expect(await sqliteObjectView.get('1')).toEqual({ name: 'Bob' });
		});
	});

	describe('delete', () => {

		it('removes an existing record and returns true', async () => {
			await sqliteObjectView.create('1', { name: 'Alice' });
			const result = await sqliteObjectView.delete('1');
			expect(result).toBe(true);
			expect(await sqliteObjectView.get('1')).toBe(undefined);
		});

		it('returns false when record does not exist', async () => {
			const result = await sqliteObjectView.delete('missing');
			expect(result).toBe(false);
		});
	});
});
