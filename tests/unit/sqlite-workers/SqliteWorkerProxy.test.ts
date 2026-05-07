import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import createDb, { type Database, type Statement } from 'better-sqlite3';
import { AbstractSqliteAccessor } from '../../../src/sqlite/index.ts';
import {
	type AsyncSqliteStatement,
	SqliteWorkerProxy,
	type SqliteRunResult
} from '../../../src/sqlite-workers/index.ts';

class TestSqliteAccessor extends AbstractSqliteAccessor {
	#workerProxy: SqliteWorkerProxy | undefined;
	#insertRecordQuery!: Statement<[string], void>;
	#getRecordQuery!: AsyncSqliteStatement;
	#allRecordsQuery!: AsyncSqliteStatement;
	#runReadQuery!: AsyncSqliteStatement;

	protected override async initialize(db: Database): Promise<void> {
		db.pragma('journal_mode = WAL');

		db.exec(`
			CREATE TABLE records (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL
			)
		`);

		this.#workerProxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: db.name,
				pragmas: ['query_only = ON']
			}
		});

		this.#insertRecordQuery = db.prepare(`
			INSERT INTO records (name)
			VALUES (?)
		`);

		this.#getRecordQuery = await this.#workerProxy.prepare('SELECT name FROM records WHERE id = ?');
		this.#allRecordsQuery = await this.#workerProxy.prepare('SELECT id, name FROM records ORDER BY id');
		this.#runReadQuery = await this.#workerProxy.prepare('SELECT 1');
	}

	async createRecord(name: string): Promise<void> {
		await this.assertConnection();
		this.#insertRecordQuery.run(name);
	}

	async getRecord(id: number): Promise<{ name: string } | undefined> {
		await this.assertConnection();
		return this.#getRecordQuery.get<{ name: string }>([id]);
	}

	async getPreparedRecords(): Promise<{ id: number, name: string }[]> {
		await this.assertConnection();
		return this.#allRecordsQuery.all<{ id: number, name: string }>();
	}

	async runPreparedRead(): Promise<SqliteRunResult> {
		await this.assertConnection();
		return this.#runReadQuery.run();
	}

	async allRecords(): Promise<{ id: number, name: string }[]> {
		await this.assertConnection();
		return this.#assertWorkerProxy().all<{ id: number, name: string }>('SELECT id, name FROM records ORDER BY id');
	}

	async getRecordDirect(id: number): Promise<{ name: string } | undefined> {
		await this.assertConnection();
		return this.#assertWorkerProxy().get<{ name: string }>('SELECT name FROM records WHERE id = ?', [id]);
	}

	async runReadStatement(): Promise<SqliteRunResult> {
		await this.assertConnection();
		return this.#assertWorkerProxy().run('SELECT 1');
	}

	async dispose(): Promise<void> {
		await this.#workerProxy?.dispose();
	}

	#assertWorkerProxy(): SqliteWorkerProxy {
		if (!this.#workerProxy)
			throw new Error('SQLite worker proxy is not initialized');

		return this.#workerProxy;
	}
}

class RejectingDisposeProxy extends SqliteWorkerProxy {
	override async dispose(): Promise<void> {
		throw new Error('dispose failed');
	}
}

describe('SqliteWorkerProxy', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-cqrs-sqlite-workers-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, {
			force: true,
			recursive: true
		});
	});

	function createFixtureDb() {
		const dbPath = path.join(tmpDir, 'fixture.db');
		const db = createDb(dbPath);
		db.close();

		return dbPath;
	}

	it('creates a worker and reads from a prepared statement', async () => {
		const dbPath = path.join(tmpDir, 'views.db');
		const db = createDb(dbPath);
		const accessor = new TestSqliteAccessor({
			viewModelSqliteDbFactory: () => db
		});

		try {
			await accessor.createRecord('alpha');
			await accessor.createRecord('beta');

			const row = await accessor.getRecord(2);

			expect(row).toEqual({ name: 'beta' });
			await expect(accessor.getPreparedRecords()).resolves.toEqual([
				{ id: 1, name: 'alpha' },
				{ id: 2, name: 'beta' }
			]);
			await expect(accessor.runPreparedRead()).resolves.toMatchObject({ changes: 0 });
		}
		finally {
			await accessor.dispose();
			db.close();
		}
	});

	it('runs direct worker reads and can be disposed more than once', async () => {
		const dbPath = path.join(tmpDir, 'direct-reads.db');
		const db = createDb(dbPath);
		const accessor = new TestSqliteAccessor({
			viewModelSqliteDbFactory: () => db
		});

		try {
			await accessor.createRecord('alpha');
			await accessor.createRecord('beta');

			await expect(accessor.allRecords()).resolves.toEqual([
				{ id: 1, name: 'alpha' },
				{ id: 2, name: 'beta' }
			]);
			await expect(accessor.getRecordDirect(1)).resolves.toEqual({ name: 'alpha' });
			await expect(accessor.runReadStatement()).resolves.toMatchObject({ changes: 0 });

			await accessor.dispose();
			await accessor.dispose();
		}
		finally {
			await accessor.dispose();
			db.close();
		}
	});

	it('reuses the created worker until disposal', async () => {
		const workerPath = path.join(tmpDir, 'ready-worker.cjs');
		fs.writeFileSync(workerPath, `
			const { parentPort } = require('node:worker_threads');
			parentPort.postMessage({ type: 'ready' });
			setInterval(() => undefined, 1000);
		`);

		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: createFixtureDb()
			},
			sqliteWorkerRunnerLocation: workerPath
		});

		try {
			const worker = await proxy.assertWorker();

			await expect(proxy.assertWorker()).resolves.toBe(worker);
		}
		finally {
			await proxy.dispose();
		}
	});

	it('ignores disposal failures from worker event handlers', async () => {
		const errorWorkerPath = path.join(tmpDir, 'error-worker.cjs');
		fs.writeFileSync(errorWorkerPath, `
			const { parentPort } = require('node:worker_threads');
			parentPort.postMessage({ type: 'ready' });
			setTimeout(() => { throw new Error('worker exploded'); }, 20);
		`);

		const errorProxy = new RejectingDisposeProxy({
			dbConfig: {
				dbLocation: createFixtureDb()
			},
			sqliteWorkerRunnerLocation: errorWorkerPath
		});
		const errorWorker = await errorProxy.assertWorker();

		await expect(new Promise<Error>(resolve => errorWorker.once('error', resolve)))
			.resolves.toMatchObject({ message: 'worker exploded' });

		const exitWorkerPath = path.join(tmpDir, 'exit-worker.cjs');
		fs.writeFileSync(exitWorkerPath, `
			const { parentPort } = require('node:worker_threads');
			parentPort.postMessage({ type: 'ready' });
			setTimeout(() => process.exit(0), 20);
		`);

		const exitProxy = new RejectingDisposeProxy({
			dbConfig: {
				dbLocation: createFixtureDb()
			},
			sqliteWorkerRunnerLocation: exitWorkerPath
		});
		const exitWorker = await exitProxy.assertWorker();

		await expect(new Promise(resolve => exitWorker.once('exit', resolve)))
			.resolves.toBe(0);
	});

	it('validates worker configuration before creating the worker', async () => {
		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: ''
			}
		});

		try {
			await expect(proxy.all('SELECT 1')).rejects
				.toThrow('Either dbLocation or dbFactoryLocation is required');
		}
		finally {
			await proxy.dispose();
		}
	});

	it('allows empty worker pragma configuration before creating the worker', async () => {
		const dbPath = path.join(tmpDir, 'empty-pragmas.db');
		const db = createDb(dbPath);
		db.exec(`
			CREATE TABLE records (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL
			);

			INSERT INTO records (name)
			VALUES ('alpha');
		`);

		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: dbPath,
				pragmas: []
			}
		});

		try {
			await expect(proxy.all('SELECT id, name FROM records ORDER BY id')).resolves.toEqual([
				{ id: 1, name: 'alpha' }
			]);
		}
		finally {
			await proxy.dispose();
			db.close();
		}
	});

	it('creates the worker database through a custom factory module', async () => {
		const dbPath = path.join(tmpDir, 'factory.db');
		const db = createDb(dbPath);
		db.exec(`
			CREATE TABLE records (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL
			);

			INSERT INTO records (name)
			VALUES ('alpha');
		`);
		db.close();

		const factoryPath = path.join(tmpDir, 'sqlite-worker-db-factory.cjs');
		fs.writeFileSync(factoryPath, `
			const createDb = require(${JSON.stringify(path.join(process.cwd(), 'node_modules', 'better-sqlite3'))});

			exports.createSqliteWorkerDb = params => {
				if (!params || params.secret !== 'ok')
					throw new Error('factory params missing');

				const db = createDb(params.dbLocation, {
					readonly: true,
					fileMustExist: true
				});
				db.pragma(params.pragma);

				return db;
			};
		`);

		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbFactoryLocation: factoryPath,
				dbFactoryParams: {
					dbLocation: dbPath,
					pragma: 'query_only = ON',
					secret: 'ok'
				}
			}
		});

		try {
			await expect(proxy.all('SELECT id, name FROM records ORDER BY id')).resolves.toEqual([
				{ id: 1, name: 'alpha' }
			]);
		}
		finally {
			await proxy.dispose();
		}
	});

	it('can dispose after worker startup fails', async () => {
		const dbPath = path.join(tmpDir, 'failed-worker.db');
		const db = createDb(dbPath);
		const workerPath = path.join(tmpDir, 'exit-worker.cjs');
		fs.writeFileSync(workerPath, '');

		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: dbPath
			},
			sqliteWorkerRunnerLocation: workerPath
		});

		try {
			await expect(proxy.all('SELECT 1')).rejects.toThrow('Worker exited prematurely with exit code 0');
			await expect(proxy.dispose()).resolves.toBeUndefined();
		}
		finally {
			db.close();
		}
	});

	it('cleans up after worker api startup fails', async () => {
		const dbPath = path.join(tmpDir, 'failed-worker-api.db');
		const db = createDb(dbPath);
		const workerPath = path.join(tmpDir, 'exit-worker-api.cjs');
		fs.writeFileSync(workerPath, '');

		const proxy = new SqliteWorkerProxy({
			dbConfig: {
				dbLocation: dbPath
			},
			sqliteWorkerRunnerLocation: workerPath
		});

		try {
			await expect(proxy.prepare('SELECT 1')).rejects.toThrow('Worker exited prematurely with exit code 0');
			await expect(proxy.dispose()).resolves.toBeUndefined();
		}
		finally {
			db.close();
		}
	});
});
