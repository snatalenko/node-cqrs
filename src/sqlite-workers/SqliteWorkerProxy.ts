import { Worker } from 'node:worker_threads';
import * as Comlink from 'comlink';
import type {
	SqliteWorkerProxyParams,
	SqliteWorkerQueryParams,
	ISqliteWorkerApi,
	SqliteRunResult
} from './protocol.ts';
import { createSqliteWorker, nodeEndpoint } from './utils/index.ts';
import { AsyncSqliteStatement } from './AsyncSqliteStatement.ts';

export class SqliteWorkerProxy {

	readonly #config: SqliteWorkerProxyParams;
	#worker: Worker | undefined;
	#workerPromise: Promise<Worker> | undefined;
	#workerApi: Comlink.Remote<ISqliteWorkerApi> | undefined;
	#workerApiPromise: Promise<Comlink.Remote<ISqliteWorkerApi>> | undefined;
	#disposePromise: Promise<void> | undefined;

	constructor(config: SqliteWorkerProxyParams) {
		this.#config = config;
	}

	async all<TRow>(sql: string, params?: SqliteWorkerQueryParams): Promise<TRow[]> {
		const workerApi = await this.#assertWorkerApi();
		return workerApi.all(sql, params) as Promise<TRow[]>;
	}

	async get<TRow>(sql: string, params?: SqliteWorkerQueryParams): Promise<TRow | undefined> {
		const workerApi = await this.#assertWorkerApi();
		return workerApi.get(sql, params) as Promise<TRow | undefined>;
	}

	async run(sql: string, params?: SqliteWorkerQueryParams): Promise<SqliteRunResult> {
		const workerApi = await this.#assertWorkerApi();
		return workerApi.run(sql, params);
	}

	async prepare<BindParameters extends unknown[] | {} = unknown[], Result = unknown>(
		sql: string
	): Promise<BindParameters extends unknown[] ?
		AsyncSqliteStatement<BindParameters, Result> :
		AsyncSqliteStatement<[BindParameters], Result>
	> {
		const workerApi = await this.#assertWorkerApi();
		const handle = await workerApi.prepare(sql);

		return new AsyncSqliteStatement(workerApi, handle) as BindParameters extends unknown[] ?
			AsyncSqliteStatement<BindParameters, Result> :
			AsyncSqliteStatement<[BindParameters], Result>;
	}

	async dispose(): Promise<void> {
		this.#disposePromise ??= this.#disposeWorker()
			.finally(() => {
				this.#disposePromise = undefined;
			});

		return this.#disposePromise;
	}

	/** @internal */
	async assertWorker(): Promise<Worker> {
		if (this.#worker)
			return this.#worker;

		this.#workerPromise ??= createSqliteWorker(this.#config)
			.then(worker => {
				this.#worker = worker;
				worker.once('error', this.handleWorkerError);
				worker.once('exit', this.handleWorkerExit);

				return worker;
			});

		return this.#workerPromise;
	}

	async #assertWorkerApi(): Promise<Comlink.Remote<ISqliteWorkerApi>> {
		if (this.#workerApi)
			return this.#workerApi;

		this.#workerApiPromise ??= this.assertWorker()
			.then(worker => {
				this.#workerApi = Comlink.wrap<ISqliteWorkerApi>(nodeEndpoint(worker));
				return this.#workerApi;
			});

		return this.#workerApiPromise;
	}

	async #disposeWorker(): Promise<void> {
		if (!this.#worker && !this.#workerPromise)
			return;

		const workerApi = this.#workerApi ?? await this.#workerApiPromise?.catch(() => undefined);
		const worker = this.#worker ?? await this.#workerPromise?.catch(() => undefined);

		this.#worker = undefined;
		this.#workerPromise = undefined;
		this.#workerApi = undefined;
		this.#workerApiPromise = undefined;

		workerApi?.[Comlink.releaseProxy]();

		if (!worker)
			return;

		worker.off('error', this.handleWorkerError);
		worker.off('exit', this.handleWorkerExit);
		await worker.terminate();
	}

	handleWorkerError = (_err: Error) => {
		void this.dispose().catch(() => undefined);
	};

	handleWorkerExit = (_exitCode: number) => {
		void this.dispose().catch(() => undefined);
	};
}
