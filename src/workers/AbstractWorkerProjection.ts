import { isMainThread, Worker, MessageChannel, parentPort, workerData } from 'node:worker_threads';
import { AbstractProjection, type AbstractProjectionParams } from '../AbstractProjection.ts';
import type { IEvent } from '../interfaces/index.ts';
import * as Comlink from 'comlink';
import { nodeEndpoint, createWorker } from './utils/index.ts';
import { extractErrorDetails } from '../utils/index.ts';
import { isWorkerData, type IWorkerData, type WorkerInitMessage } from './protocol.ts';

export type AbstractWorkerProjectionParams<TView> = AbstractProjectionParams<TView> & {

	/**
	 * Required in the main thread to spawn a worker (derived projection module path).
	 * Not used in the worker thread.
	 */
	workerModulePath?: string;

	/**
	 * When `false`, runs projection + view in the current thread (no Worker, no RPC).
	 * Intended for tests and environments where worker threads aren't desired.
	 */
	useWorkerThreads?: boolean;
};

interface IRemoteProjectionApi {
	project(event: IEvent): Promise<void> | void;
	_project(event: IEvent): Promise<void> | void;
	ping(): true;
}

interface IMainThreadProjection<TView> {
	get remoteProjection(): Comlink.Remote<IRemoteProjectionApi>;
	get remoteView(): Comlink.Remote<TView>;
}

/**
 * Projection base class that can run projection handlers and the associated view in a worker thread
 * to isolate CPU-heavy work and keep the main thread responsive
 */
export abstract class AbstractWorkerProjection<TView> extends AbstractProjection<TView> {

	#worker?: Worker;
	readonly #workerInit?: Promise<Worker>;
	readonly #remoteProjection?: Comlink.Remote<IRemoteProjectionApi>;
	readonly #remoteView?: Comlink.Remote<TView>;
	readonly #useWorkerThreads: boolean;

	/**
	 * Creates an instance of a class derived from AbstractWorkerProjection in a Worker thread
	 *
	 * @param factory - Optional factory function to create the projection instance
	 */
	static createWorkerInstance<V, T extends AbstractWorkerProjection<V>>(
		this: new () => T,
		factory?: () => T
	): T {
		if (!parentPort)
			throw new Error('createWorkerInstance can only be called from a Worker thread');
		if (!isWorkerData(workerData))
			throw new Error('workerData does not contain projectionPort and viewPort');

		const workerProjectionInstance = factory?.() ?? new this();
		const workerProjectionInstanceApi: IRemoteProjectionApi = {
			project: event => workerProjectionInstance.project(event),
			_project: event => workerProjectionInstance._project(event),
			ping: () => workerProjectionInstance._pong()
		};

		Comlink.expose(workerProjectionInstanceApi, nodeEndpoint(workerData.projectionPort));
		Comlink.expose(workerProjectionInstance.view, nodeEndpoint(workerData.viewPort));

		parentPort.postMessage({ type: 'ready' } satisfies WorkerInitMessage);

		return workerProjectionInstance;
	}

	/**
	 * Convenience wrapper for module-level bootstrapping.
	 *
	 * In the main thread, does nothing.
	 * In a worker thread, creates and exposes the projection singleton (same as createWorkerInstance).
	 */
	static createInstanceIfWorkerThread<V, T extends AbstractWorkerProjection<V>>(
		this: (new () => T) & { createWorkerInstance: (factory?: () => T) => T },
		factory?: () => T
	): T | undefined {
		if (isMainThread)
			return undefined;

		return this.createWorkerInstance(factory);
	}

	async project(event: IEvent): Promise<void> {
		if (this.#useWorkerThreads && isMainThread) {
			if (!this.#worker)
				await this.#workerInit;

			return this.remoteProjection.project(event);
		}

		return super.project(event);
	}

	/**
	 * Proxy to the projection instance in the worker thread
	 */
	get remoteProjection(): Comlink.Remote<IRemoteProjectionApi> {
		this.assertMainThread();
		return this.#remoteProjection!;
	}

	/**
	 * Proxy to the projection instance in the worker thread (awaits worker init)
	 */
	get remoteProjectionInitializer(): Promise<Comlink.Remote<IRemoteProjectionApi>> {
		this.assertMainThread();
		return this.ensureWorkerReady().then(() => this.remoteProjection);
	}

	/**
	 * Proxy to the view instance in the worker thread
	 */
	get remoteView(): Comlink.Remote<TView> {
		this.assertMainThread();
		return this.#remoteView!;
	}

	get view(): TView {
		if (this.#useWorkerThreads && isMainThread)
			return this.remoteView as unknown as TView;

		return super.view;
	}

	/**
	 * Proxy to the view instance in the worker thread (awaits worker init)
	 */
	get remoteViewInitializer(): Promise<Comlink.Remote<TView>> {
		this.assertMainThread();
		return this.ensureWorkerReady().then(() => this.remoteView);
	}

	constructor({
		workerModulePath,
		useWorkerThreads = true,
		view,
		viewLocker,
		eventLocker,
		logger
	}: AbstractWorkerProjectionParams<TView> = {}) {
		super({
			view,
			viewLocker,
			eventLocker,
			logger
		});

		this.#useWorkerThreads = useWorkerThreads;

		if (this.#useWorkerThreads && isMainThread) {
			if (!workerModulePath)
				throw new TypeError('workerModulePath parameter is required in the main thread when useWorkerThreads=true');

			const { port1: projectionPortMain, port2: projectionPort } = new MessageChannel();
			const { port1: viewPortMain, port2: viewPort } = new MessageChannel();

			this.#workerInit = this._createWorker(workerModulePath, {
				projectionPort,
				viewPort
			}).then(worker => {
				this.#worker = worker;
				worker.once('error', this._onWorkerError);
				worker.once('exit', this._onWorkerExit);
				return worker;
			});

			this.#workerInit.catch(() => { });

			this.#remoteProjection = Comlink.wrap<IRemoteProjectionApi>(nodeEndpoint(projectionPortMain));
			this.#remoteView = Comlink.wrap<TView>(nodeEndpoint(viewPortMain));
		}
	}

	// eslint-disable-next-line class-methods-use-this
	protected async _createWorker(workerModulePath: string, data: IWorkerData): Promise<Worker> {
		return createWorker(workerModulePath, data);
	}

	protected _onWorkerError = (error: unknown) => {
		this._logger?.error('worker error', {
			error: extractErrorDetails(error)
		});
	};

	protected _onWorkerExit = (exitCode: number) => {
		if (exitCode !== 0)
			this._logger?.error(`worker exited with code ${exitCode}`);
	};

	protected _pong(): true {
		this.assertWorkerThread();
		return true;
	}

	protected assertMainThread(): asserts this is this & IMainThreadProjection<TView> {
		if (!isMainThread)
			throw new Error('This method can only be called from the main thread');
		if (!this.#useWorkerThreads)
			throw new Error('Worker threads are disabled for this projection instance');
		if (!this.#workerInit)
			throw new Error('Worker instance is not initialized');
		if (!this.#remoteProjection)
			throw new Error('Remote projection instance is not initialized');
		if (!this.#remoteView)
			throw new Error('Remote view instance is not initialized');
	}

	// eslint-disable-next-line class-methods-use-this
	protected assertWorkerThread() {
		if (!parentPort)
			throw new Error('This method can only be called from a Worker thread');
	}

	async ensureWorkerReady(): Promise<void> {
		if (this.#useWorkerThreads && isMainThread)
			await this.#workerInit;
	}

	protected async _project(event: IEvent): Promise<void> {
		if (this.#useWorkerThreads && isMainThread) {
			if (!this.#worker)
				await this.#workerInit;

			return this.remoteProjection._project(event);
		}

		return super._project(event);
	}

	dispose() {
		if (this.#useWorkerThreads && isMainThread) {
			this.#remoteProjection?.[Comlink.releaseProxy]();
			this.#remoteView?.[Comlink.releaseProxy]();
			this.#worker?.terminate();
		}
	}
}
