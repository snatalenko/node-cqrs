import { parentPort, workerData } from 'node:worker_threads';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Comlink from 'comlink';
import Database, { type Statement } from 'better-sqlite3';
import {
	isSqliteWorkerData,
	type SqliteRunResult,
	type ISqliteWorkerApi,
	type SqliteWorkerRunnerDbParams,
	type SqliteWorkerQueryParams,
	type SqliteWorkerStatementHandle
} from './protocol.ts';
import { nodeEndpoint } from './utils/index.ts';
import { assertString, assertStringArray } from '../utils/index.ts';

declare const __filename: string | undefined;

function all<TRow>(statement: Statement<unknown[], TRow>, params?: SqliteWorkerQueryParams): TRow[] {
	return params === undefined ? statement.all() : statement.all(params);
}

function get<TRow>(statement: Statement<unknown[], TRow>, params?: SqliteWorkerQueryParams): TRow | undefined {
	return params === undefined ? statement.get() : statement.get(params);
}

function run(statement: Statement, params?: SqliteWorkerQueryParams): SqliteRunResult {
	return params === undefined ? statement.run() : statement.run(params);
}

/** @internal */
export function resolveCurrentFileLocationFromStack(stack = new Error().stack) {
	const stackFilename = stack?.match(/\((file:\/\/[^)]+SqliteWorkerRunner\.js):\d+:\d+\)/)?.[1];
	if (!stackFilename)
		throw new Error('Worker location could not be resolved from Error stack, pass sqliteWorkerRunnerLocation');

	return fileURLToPath(stackFilename);
}

export class SqliteWorkerRunner implements ISqliteWorkerApi {

	static get location() {
		if (typeof __filename !== 'undefined' && path.isAbsolute(__filename))
			return __filename;

		/* istanbul ignore next -- exercised by ESM consumers, not ts-jest's CJS transform */
		return resolveCurrentFileLocationFromStack();
	}

	readonly #db;
	#nextStatementHandle = 1;
	readonly #statements = new Map<SqliteWorkerStatementHandle, Statement<unknown[], unknown>>();

	constructor(dbParams: SqliteWorkerRunnerDbParams) {
		assertString(dbParams.location, 'dbParams.location');

		this.#db = new Database(dbParams.location, {
			readonly: true,
			fileMustExist: true
		});

		if (dbParams.pragmas?.length) {
			assertStringArray(dbParams.pragmas, 'dbParams.pragmas');

			for (const pragma of dbParams.pragmas)
				this.#db.pragma(pragma);
		}
	}

	all<TRow>(sql: string, params?: SqliteWorkerQueryParams): TRow[] {
		const statement = this.#db.prepare<unknown[], TRow>(sql);
		return all(statement, params);
	}

	get<TRow>(sql: string, params?: SqliteWorkerQueryParams): TRow | undefined {
		const statement = this.#db.prepare<unknown[], TRow>(sql);
		return get(statement, params);
	}

	run(sql: string, params?: SqliteWorkerQueryParams): SqliteRunResult {
		const statement = this.#db.prepare(sql);
		return run(statement, params);
	}

	prepare(sql: string): SqliteWorkerStatementHandle {
		const handle = this.#nextStatementHandle++;
		this.#statements.set(handle, this.#db.prepare(sql));

		return handle;
	}

	/** @internal */
	allPrepared<TRow>(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): TRow[] {
		return all(this.#getStatement<TRow>(handle), params);
	}

	/** @internal */
	getPrepared<TRow>(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): TRow | undefined {
		return get(this.#getStatement<TRow>(handle), params);
	}

	/** @internal */
	runPrepared(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): SqliteRunResult {
		return run(this.#getStatement(handle), params);
	}

	#getStatement<TRow>(handle: SqliteWorkerStatementHandle): Statement<unknown[], TRow> {
		const statement = this.#statements.get(handle);
		if (!statement)
			throw new Error(`SQLite worker statement '${handle}' does not exist`);

		return statement as Statement<unknown[], TRow>;
	}
}

/* istanbul ignore next -- this branch runs inside the spawned worker process */
if (parentPort) {
	if (!isSqliteWorkerData(workerData))
		throw new Error('workerData does not contain SQLite worker db parameters');

	const runner = new SqliteWorkerRunner(workerData.db);

	parentPort.postMessage({ type: 'ready' });
	Comlink.expose(runner, nodeEndpoint(parentPort));
}
