import type { Statement } from 'better-sqlite3';

export type SqliteWorkerProxyParams = {

	/** SQLite database file opened readonly by the worker. */
	dbLocation: string;

	/** PRAGMA statements applied to the worker connection. */
	pragmas?: readonly string[];

	/** Worker runner script location; defaults to the bundled runner. */
	sqliteWorkerRunnerLocation?: string | URL;
};

export type SqliteWorkerRunnerDbParams = {
	location: string;
	pragmas?: readonly string[];
};

export type SqliteWorkerData = {
	db: SqliteWorkerRunnerDbParams;
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

export function isSqliteWorkerData(value: unknown): value is SqliteWorkerData {
	return typeof value === 'object' &&
		value !== null &&
		'db' in value &&
		typeof value.db === 'object' &&
		value.db !== null &&
		'location' in value.db &&
		typeof value.db.location === 'string';
}

export function isSqliteWorkerReadyMessage(value: unknown): value is SqliteWorkerReadyMessage {
	return typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		value.type === 'ready';
}
