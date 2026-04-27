import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import createDb from 'better-sqlite3';
import { isSqliteWorkerData } from '../../../src/sqlite-workers/protocol.ts';
import { resolveCurrentFileLocationFromStack, SqliteWorkerRunner } from '../../../src/sqlite-workers/SqliteWorkerRunner.ts';
import { createSqliteWorker } from '../../../src/sqlite-workers/utils/createSqliteWorker.ts';

describe('SqliteWorkerRunner', () => {
	let tmpDir: string;
	let dbCounter: number;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-cqrs-sqlite-worker-runner-'));
		dbCounter = 0;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, {
			force: true,
			recursive: true
		});
	});

	function createFixtureDb() {
		dbCounter++;
		const dbPath = path.join(tmpDir, `fixture-${dbCounter}.db`);
		const db = createDb(dbPath);
		db.exec(`
			CREATE TABLE records (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL
			);

			INSERT INTO records (name)
			VALUES ('alpha'), ('beta');
		`);
		db.close();

		return dbPath;
	}

	it('executes direct and prepared read statements', () => {
		const dbPath = createFixtureDb();
		const runner = new SqliteWorkerRunner({
			location: dbPath,
			pragmas: ['query_only = ON']
		});

		expect(runner.all<{ id: number, name: string }>('SELECT id, name FROM records ORDER BY id'))
			.toEqual([
				{ id: 1, name: 'alpha' },
				{ id: 2, name: 'beta' }
			]);
		expect(runner.get<{ name: string }>('SELECT name FROM records WHERE id = ?', [2]))
			.toEqual({ name: 'beta' });
		expect(runner.run('SELECT 1')).toMatchObject({ changes: 0 });

		const selectHandle = runner.prepare('SELECT name FROM records WHERE id = ?');
		expect(runner.getPrepared<{ name: string }>(selectHandle, [1])).toEqual({ name: 'alpha' });

		const allHandle = runner.prepare('SELECT id, name FROM records ORDER BY id');
		expect(runner.allPrepared<{ id: number, name: string }>(allHandle))
			.toHaveLength(2);

		const runHandle = runner.prepare('SELECT 1');
		expect(runner.runPrepared(runHandle)).toMatchObject({ changes: 0 });
		expect(() => runner.getPrepared(999)).toThrow("SQLite worker statement '999' does not exist");
	});

	it('validates database configuration and protocol data', () => {
		expect(() => new SqliteWorkerRunner({ location: '' }))
			.toThrow('dbParams.location must be a non-empty String');
		expect(() => new SqliteWorkerRunner({ location: createFixtureDb(), pragmas: [] }))
			.not.toThrow();

		expect(isSqliteWorkerData({
			db: {
				location: 'views.db'
			}
		})).toBe(true);
		expect(isSqliteWorkerData(null)).toBe(false);
		expect(isSqliteWorkerData({})).toBe(false);
		expect(isSqliteWorkerData({ db: {} })).toBe(false);
		expect(isSqliteWorkerData({ db: { location: 1 } })).toBe(false);
	});

	it('handles non-ready messages, worker errors, and premature exits while creating workers', async () => {
		const readyWorkerPath = path.join(tmpDir, 'ready-worker.cjs');
		fs.writeFileSync(readyWorkerPath, `
			const { parentPort } = require('node:worker_threads');
			parentPort.postMessage({ type: 'ignored' });
			parentPort.postMessage({ type: 'ready' });
		`);

		const worker = await createSqliteWorker({
			dbLocation: createFixtureDb(),
			sqliteWorkerRunnerLocation: readyWorkerPath
		});
		await worker.terminate();

		const errorWorkerPath = path.join(tmpDir, 'error-worker.cjs');
		fs.writeFileSync(errorWorkerPath, 'throw new Error("worker exploded");');
		await expect(() => createSqliteWorker({
			dbLocation: createFixtureDb(),
			sqliteWorkerRunnerLocation: errorWorkerPath
		}))
			.rejects.toThrow('worker exploded');

		const exitWorkerPath = path.join(tmpDir, 'exit-worker.cjs');
		fs.writeFileSync(exitWorkerPath, '');
		await expect(() => createSqliteWorker({
			dbLocation: createFixtureDb(),
			sqliteWorkerRunnerLocation: exitWorkerPath
		}))
			.rejects.toThrow('SQLite worker exited prematurely with exit code 0');
	});

	describe('resolveCurrentFileLocationFromStack', () => {

		it('resolves file worker runner location from an Error stack', () => {
			expect(resolveCurrentFileLocationFromStack(
				'Error\n at resolve (file:///tmp/dist/esm/sqlite-workers/SqliteWorkerRunner.js:10:5)'
			)).toBe('/tmp/dist/esm/sqlite-workers/SqliteWorkerRunner.js');
		});

		it('throws when the worker runner location is missing from the Error stack', () => {
			expect(() => resolveCurrentFileLocationFromStack('Error\n at resolve (/tmp/SqliteWorkerRunner.ts:10:5)'))
				.toThrow('Worker location could not be resolved from Error stack, pass sqliteWorkerRunnerLocation');
		});
	});
});
