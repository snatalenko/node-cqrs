import * as Comlink from 'comlink';
import type {
	SqliteRunResult,
	ISqliteWorkerApi,
	SqliteWorkerQueryParams,
	SqliteWorkerStatementHandle
} from './protocol.ts';

export class AsyncSqliteStatement {

	readonly #workerApi: Comlink.Remote<ISqliteWorkerApi>;
	readonly #handle: SqliteWorkerStatementHandle;

	constructor(
		workerApi: Comlink.Remote<ISqliteWorkerApi>,
		handle: SqliteWorkerStatementHandle
	) {
		this.#workerApi = workerApi;
		this.#handle = handle;
	}

	async all<TRow>(params?: SqliteWorkerQueryParams): Promise<TRow[]> {
		return this.#workerApi.allPrepared(this.#handle, params) as Promise<TRow[]>;
	}

	async get<TRow>(params?: SqliteWorkerQueryParams): Promise<TRow | undefined> {
		return this.#workerApi.getPrepared(this.#handle, params) as Promise<TRow | undefined>;
	}

	async run(params?: SqliteWorkerQueryParams): Promise<SqliteRunResult> {
		return this.#workerApi.runPrepared(this.#handle, params);
	}
}
