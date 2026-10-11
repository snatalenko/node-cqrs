import createDb from 'better-sqlite3';
import { SqliteObjectView, type SqliteProjectionDbFactoryParams } from '../../../src/sqlite/index.ts';
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

	it('routes projection versions to databases shared by the view, storage, and lockers', async () => {
		const databases = new Map([
			['Users:1', createDb(':memory:')],
			['Users:2', createDb(':memory:')],
			['Orders:1', createDb(':memory:')]
		]);
		const factory = jest.fn((params?: SqliteProjectionDbFactoryParams) => {
			if (!params)
				throw new Error('Projection context required');

			return databases.get(`${params.projectionName}:${params.schemaVersion}`)!;
		});

		try {
			for (const key of databases.keys()) {
				const [projectionName, schemaVersion] = key.split(':');
				const view = new SqliteObjectView<{ name: string }>({
					viewModelSqliteDbFactory: factory,
					projectionName,
					schemaVersion,
					tableNamePrefix: 'records'
				});
				const event = { id: 'a0000000000000000000000000000001', type: 'Created', payload: { name: key } };

				await expect(view.runInTransaction(async () => {
					expect(await view.tryMarkAsProjecting(event)).toBe(true);
					await view.create('1', { name: key });
					await view.markAsProjected(event);
					throw new Error('failed');
				})).rejects.toThrow('failed');
				expect(await view.get('1')).toBeUndefined();

				await view.runInTransaction(async () => {
					expect(await view.tryMarkAsProjecting(event)).toBe(true);
					await view.create('1', { name: key });
					await view.markAsProjected(event);
				});
				expect(await view.get('1')).toEqual({ name: key });
				expect(await view.tryMarkAsProjecting(event)).toBe(false);
			}

			expect(factory.mock.calls).toEqual([
				...Array(4).fill([{ projectionName: 'Users', schemaVersion: '1' }]),
				...Array(4).fill([{ projectionName: 'Users', schemaVersion: '2' }]),
				...Array(4).fill([{ projectionName: 'Orders', schemaVersion: '1' }])
			]);
		}
		finally {
			for (const db of databases.values())
				db.close();
		}
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
