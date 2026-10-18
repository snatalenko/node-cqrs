import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createDb, { type Database } from 'better-sqlite3';
import { AbstractSqliteAccessor, type SqliteProjectionDbFactoryParams } from '../../../src/sqlite/index.ts';

class TestAccessor<TFactoryParams extends object = SqliteProjectionDbFactoryParams>
	extends AbstractSqliteAccessor<TFactoryParams> {

	initializeCalls = 0;

	protected initialize(db: Database) {
		this.initializeCalls++;
		db.exec('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY)');
	}

	insert(id: string) {
		return this.runExclusively(db => db.prepare('INSERT INTO records (id) VALUES (?)').run(id));
	}

	ids() {
		return this.runExclusively(db => db.prepare('SELECT id FROM records ORDER BY id').pluck().all());
	}

	runAfterCommit(callback: () => void) {
		this.afterCommit(callback);
	}
}

const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

describe('AbstractSqliteAccessor', () => {

	let db: Database;
	let accessor: TestAccessor;

	beforeEach(() => {
		db = createDb(':memory:');
		accessor = new TestAccessor({ viewModelSqliteDb: db });
	});

	afterEach(() => {
		db.close();
	});

	describe('runInTransaction', () => {

		it('commits changes once the callback resolves', async () => {
			await accessor.runInTransaction(async () => {
				await accessor.insert('a');
				expect(db.inTransaction).toBe(true);
			});

			expect(db.inTransaction).toBe(false);
			expect(await accessor.ids()).toEqual(['a']);
		});

		it('rolls back changes when the callback rejects', async () => {
			await expect(accessor.runInTransaction(async () => {
				await accessor.insert('a');
				throw new Error('failed');
			})).rejects.toThrow('failed');

			expect(db.inTransaction).toBe(false);
			expect(await accessor.ids()).toEqual([]);
		});

		it('joins the transaction started by another accessor using the same database', async () => {
			const other = new TestAccessor({ viewModelSqliteDb: db });

			await expect(accessor.runInTransaction(async () => {
				await other.runInTransaction(() => other.insert('a'));
				throw new Error('failed');
			})).rejects.toThrow('failed');

			expect(await other.ids()).toEqual([]);
		});

		it('serializes concurrent transactions on the same database', async () => {
			const other = new TestAccessor({ viewModelSqliteDb: db });

			await Promise.all([
				accessor.runInTransaction(async () => {
					await accessor.insert('a');
					await nextTick();
					await accessor.insert('b');
				}),
				other.runInTransaction(() => other.insert('c'))
			]);

			expect(await accessor.ids()).toEqual(['a', 'b', 'c']);
		});

		it('makes statements outside of the transaction wait until it completes', async () => {
			let releaseTransaction!: () => void;
			const transactionCanFinish = new Promise<void>(resolve => {
				releaseTransaction = resolve;
			});

			const transaction = accessor.runInTransaction(async () => {
				await accessor.insert('a');
				await transactionCanFinish;
				throw new Error('failed');
			});
			await nextTick();

			const reading = accessor.ids();
			const writing = accessor.insert('b');
			await nextTick();
			releaseTransaction();

			await expect(transaction).rejects.toThrow('failed');
			await writing;
			expect(await reading).toEqual([]);
			expect(await accessor.ids()).toEqual(['b']);
		});

		describe('with a write lock held by another connection', () => {

			let dir: string;
			let holder: Database;
			let fileDb: Database;

			beforeEach(() => {
				dir = mkdtempSync(join(tmpdir(), 'node-cqrs-sqlite-'));
				const file = join(dir, 'db.sqlite');
				holder = createDb(file);
				holder.exec('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY)');
				fileDb = createDb(file);
			});

			afterEach(() => {
				if (holder.inTransaction)
					holder.exec('ROLLBACK');
				holder.close();
				fileDb.close();
				rmSync(dir, { recursive: true, force: true });
			});

			it('waits for the lock within the busy timeout', async () => {
				fileDb.pragma('busy_timeout = 1000');
				const fileAccessor = new TestAccessor({ viewModelSqliteDb: fileDb });
				await fileAccessor.assertConnection();
				holder.exec('BEGIN IMMEDIATE');

				const transaction = fileAccessor.runInTransaction(() => fileAccessor.insert('a'));
				await new Promise(resolve => setTimeout(resolve, 30));
				holder.exec('COMMIT');

				await expect(transaction).resolves.toBeDefined();
				expect(await fileAccessor.ids()).toEqual(['a']);
				expect(fileDb.pragma('busy_timeout', { simple: true })).toBe(1000);
			});

			it('fails once the busy timeout elapses', async () => {
				fileDb.pragma('busy_timeout = 20');
				const fileAccessor = new TestAccessor({ viewModelSqliteDb: fileDb });
				await fileAccessor.assertConnection();
				holder.exec('BEGIN IMMEDIATE');

				await expect(fileAccessor.runInTransaction(() => fileAccessor.insert('a')))
					.rejects.toHaveProperty('code', 'SQLITE_BUSY');
			});
		});
	});

	describe('afterCommit', () => {

		it('runs callbacks after the transaction is committed', async () => {
			const callback = jest.fn(() => expect(db.inTransaction).toBe(false));

			await accessor.runInTransaction(async () => {
				await accessor.assertConnection();
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
	});

	describe('assertConnection', () => {

		it('passes the parameter object unchanged and creates the connection only once', async () => {
			const params = { tenant: 'tenant1' };
			const factory = jest.fn(async (_params?: { tenant: string }) => db);
			const lazyAccessor = new TestAccessor<{ tenant: string }>({
				viewModelSqliteDbFactory: factory,
				sqliteDbFactoryParams: params
			});
			expect(factory).not.toHaveBeenCalled();

			await Promise.all([lazyAccessor.assertConnection(), lazyAccessor.assertConnection()]);

			expect(factory).toHaveBeenCalledTimes(1);
			expect(factory.mock.calls[0][0]).toBe(params);
			expect(lazyAccessor.initializeCalls).toBe(1);
		});

		it('passes undefined to the factory when parameters are omitted', async () => {
			const factory = jest.fn((params?: { tenant: string }) => {
				expect(params).toBeUndefined();
				return db;
			});
			const lazyAccessor = new TestAccessor<{ tenant: string }>({ viewModelSqliteDbFactory: factory });

			await lazyAccessor.assertConnection();

			expect(factory).toHaveBeenCalledWith(undefined);
		});

		it('initializes on first use within a transaction once per transaction', async () => {
			const owner = new TestAccessor({ viewModelSqliteDb: db });

			await owner.runInTransaction(async () => {
				await accessor.insert('a');
				await accessor.insert('b');
			});

			expect(accessor.initializeCalls).toBe(1);
			expect(await accessor.ids()).toEqual(['a', 'b']);
			expect(accessor.initializeCalls).toBe(1);
		});

		it('initializes again after the transaction it initialized in is rolled back', async () => {
			const owner = new TestAccessor({ viewModelSqliteDb: db });

			await expect(owner.runInTransaction(async () => {
				await accessor.insert('a');
				throw new Error('failed');
			})).rejects.toThrow('failed');

			expect(await accessor.ids()).toEqual([]);
			expect(accessor.initializeCalls).toBe(2);
		});
	});
});
