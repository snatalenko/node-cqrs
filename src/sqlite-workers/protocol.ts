import type { Database, Statement } from 'better-sqlite3';

export type SqliteWorkerProxyParams = {

	/** Worker runner script location; defaults to the bundled runner. */
	sqliteWorkerRunnerLocation?: string | URL;

	dbConfig: SqliteWorkerRunnerDbParams;
};

export type SqliteWorkerRunnerDbParams = {

	/** SQLite database file opened readonly by the worker. */
	dbLocation: string;

	/** PRAGMA statements applied to the worker connection. */
	pragmas?: readonly string[];
} | {

	/** Module exporting createSqliteWorkerDb for custom worker-side DB creation. */
	dbFactoryLocation: string | URL;

	/** Structured-cloneable params passed to the custom worker DB factory. */
	dbFactoryParams: unknown;
};

export type SqliteWorkerDbFactory = (params: unknown) => Database | Promise<Database>;

export type SqliteWorkerData = {
	dbConfig: SqliteWorkerRunnerDbParams;
};

export type SqliteWorkerQueryParams = readonly unknown[] | Record<string, unknown>;

export type SqliteWorkerStatementHandle = number;

export type SqliteRunResult = ReturnType<Statement['run']>;

export interface ISqliteWorkerApi {
	all<TRow>(sql: string, params?: SqliteWorkerQueryParams): TRow[];
	get<TRow>(sql: string, params?: SqliteWorkerQueryParams): TRow | undefined;
	run(sql: string, params?: SqliteWorkerQueryParams): SqliteRunResult;

	prepare(sql: string): SqliteWorkerStatementHandle;

	/** @internal */
	allPrepared<TRow>(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): TRow[];

	/** @internal */
	getPrepared<TRow>(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): TRow | undefined;

	/** @internal */
	runPrepared(handle: SqliteWorkerStatementHandle, params?: SqliteWorkerQueryParams): SqliteRunResult;
}

export type SqliteWorkerReadyMessage = {
	type: 'ready';
};

const isObject = (obj: unknown): obj is {} =>
	typeof obj === 'object'
	&& obj !== null
	&& !Array.isArray(obj)
	&& !(obj instanceof Date);

export function isSqliteWorkerData(value: unknown): value is SqliteWorkerData {
	return isObject(value)
		&& 'dbConfig' in value
		&& isObject(value.dbConfig);
}

export function isSqliteWorkerReadyMessage(value: unknown): value is SqliteWorkerReadyMessage {
	return typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		value.type === 'ready';
}
