import * as Comlink from 'comlink';
import type {
	SqliteRunResult,
	ISqliteWorkerApi,
	SqliteWorkerQueryParams,
	SqliteWorkerStatementHandle
} from './protocol.ts';

type AsyncSqliteStatementParams<BindParameters extends unknown[]> =
	SqliteWorkerQueryParams & (BindParameters | Record<string, unknown>);

export class AsyncSqliteStatement<
	BindParameters extends unknown[] = unknown[],
	Result = unknown
> {

	readonly #workerApi: Comlink.Remote<ISqliteWorkerApi>;
	readonly #handle: SqliteWorkerStatementHandle;

	constructor(
		workerApi: Comlink.Remote<ISqliteWorkerApi>,
		handle: SqliteWorkerStatementHandle
	) {
		this.#workerApi = workerApi;
		this.#handle = handle;
	}

	async all<TRow = Result>(params?: AsyncSqliteStatementParams<BindParameters>): Promise<TRow[]> {
		return this.#workerApi.allPrepared(this.#handle, params) as Promise<TRow[]>;
	}

	async get<TRow = Result>(params?: AsyncSqliteStatementParams<BindParameters>): Promise<TRow | undefined> {
		return this.#workerApi.getPrepared(this.#handle, params) as Promise<TRow | undefined>;
	}

	async run(params?: AsyncSqliteStatementParams<BindParameters>): Promise<SqliteRunResult> {
		return this.#workerApi.runPrepared(this.#handle, params);
	}
}
