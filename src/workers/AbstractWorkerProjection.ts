import * as path from 'node:path';
import { isMainThread, Worker } from 'node:worker_threads';

import { AbstractProjection, type AbstractProjectionParams } from '../AbstractProjection';
import type { WorkerInitMessage, WorkerOutboundMessage } from './protocol';

export type AbstractWorkerProjectionParams<TView> = AbstractProjectionParams<TView> & {

	/**
	 * Required in the main thread to spawn a worker (derived projection module path).
	 * Not used in the worker thread.
	 */
	workerModulePath?: string;
};

export abstract class AbstractWorkerProjection<TView = any> extends AbstractProjection<TView> {

	readonly #workerModulePath?: string;

	#worker?: Worker;
	#workerReady?: Promise<Worker>;

	protected get _worker(): Worker | undefined {
		return this.#worker;
	}

	constructor({
		workerModulePath,
		view,
		viewLocker,
		eventLocker,
		logger
	}: AbstractWorkerProjectionParams<TView> = {}) {
		if (isMainThread && (typeof workerModulePath !== 'string' || !workerModulePath.length))
			throw new TypeError('workerModulePath parameter is required in the main thread');

		super({
			view,
			viewLocker,
			eventLocker,
			logger
		});

		this.#workerModulePath = workerModulePath;

		if (isMainThread)
			this.ensureWorkerReady().catch(() => {});

	}

	async ensureWorkerReady(): Promise<Worker> {
		if (!isMainThread)
			throw new Error('_ensureWorkerReady can only be called from the main thread');

		this.#workerReady ??= this._startWorkerAndHandshake();

		return this.#workerReady;
	}

	async dispose(): Promise<void> {
		const worker = this.#worker;
		this.#worker = undefined;
		this.#workerReady = undefined;

		if (worker)
			await worker.terminate();
	}

	protected _getWorkerEntrypoint(): string {
		const workerModulePath = this.#workerModulePath;
		if (typeof workerModulePath !== 'string' || !workerModulePath.length)
			throw new Error('workerModulePath is required to start worker');

		return path.isAbsolute(workerModulePath) ?
			workerModulePath :
			path.resolve(process.cwd(), workerModulePath);
	}

	protected _createWorker(): Worker {
		const workerEntrypoint = this._getWorkerEntrypoint();
		return new Worker(workerEntrypoint);
	}

	private async _startWorkerAndHandshake(): Promise<Worker> {
		const worker = this._createWorker();
		this.#worker = worker;

		const initResult = await new Promise<Extract<WorkerOutboundMessage, { kind: 'ready' | 'init.error' }>>((resolve, reject) => {
			const cleanup = () => {
				// eslint-disable-next-line no-use-before-define
				worker.off('message', onMessage);
				// eslint-disable-next-line no-use-before-define
				worker.off('error', onError);
				// eslint-disable-next-line no-use-before-define
				worker.off('exit', onExit);
			};

			const onMessage = (message: WorkerOutboundMessage) => {
				if (message.kind !== 'ready' && message.kind !== 'init.error')
					return;
				cleanup();
				resolve(message);
			};

			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};
			const onExit = (code: number) => {
				cleanup();
				reject(new Error(`Worker exited before ready (code=${code})`));
			};

			worker.on('message', onMessage);
			worker.once('error', onError);
			worker.once('exit', onExit);

			worker.postMessage({ kind: 'init' } satisfies WorkerInitMessage);
		});

		if (initResult.kind === 'init.error') {
			await worker.terminate();
			this.#worker = undefined;

			const err = new Error(initResult.error.message);
			err.name = initResult.error.name;
			if (initResult.error.stack)
				err.stack = initResult.error.stack;

			throw err;
		}

		return worker;
	}
}
