import * as path from 'node:path';
import { isMainThread, Worker, MessageChannel, parentPort, type MessagePort, workerData } from 'node:worker_threads';
import { AbstractProjection, type AbstractProjectionParams } from '../AbstractProjection';
import type { IEvent } from '../interfaces';
import * as Comlink from 'comlink';
import { nodeEndpoint } from './utils';
import { extractErrorDetails } from '../utils';

export type AbstractWorkerProjectionParams<TView> = AbstractProjectionParams<TView> & {

	/**
	 * Required in the main thread to spawn a worker (derived projection module path).
	 * Not used in the worker thread.
	 */
	workerModulePath?: string;
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

interface IWorkerData {
	projectionPort: MessagePort,
	viewPort: MessagePort
}

const isWorkerData = (obj: unknown): obj is IWorkerData =>
	typeof obj === 'object'
	&& obj !== null
	&& 'projectionPort' in obj
	&& !!obj.projectionPort
	&& 'viewPort' in obj
	&& !!obj.viewPort;

type WorkerInitMessage = { type: 'ready' };

const isWorkerInitMessage = (msg: unknown): msg is WorkerInitMessage =>
	typeof msg === 'object'
	&& msg !== null
	&& 'type' in msg
	&& msg.type === 'ready';

export abstract class AbstractWorkerProjection<TView> extends AbstractProjection<TView> {

	#worker?: Worker;
	readonly #workerInit?: Promise<Worker>;
	readonly #remoteProjection?: Comlink.Remote<IRemoteProjectionApi>;
	readonly #remoteView?: Comlink.Remote<TView>;

	/**
	 * Creates an instance of a class derived from AbstractWorkerProjection in a Worker thread
	 *
	 * @param factory - Optional factory function to create the projection instance
	 */
	static createWorkerInstance<V, T extends AbstractWorkerProjection<V>>(
		this: new (...args: any[]) => T,
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

	async project(event: IEvent): Promise<void> {
		if (isMainThread) {
			this.assertMainThread();

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
		if (isMainThread)
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

		if (isMainThread) {
			if (!workerModulePath)
				throw new TypeError('workerModulePath parameter is required in the main thread');

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
	protected async _createWorker(workerModulePath: string, workerData: IWorkerData): Promise<Worker> {
		const workerEntrypoint = path.isAbsolute(workerModulePath) ?
			workerModulePath :
			path.resolve(process.cwd(), workerModulePath);

		const worker = new Worker(workerEntrypoint, {
			workerData,
			transferList: [
				workerData.projectionPort,
				workerData.viewPort
			]
		});

		await new Promise((resolve, reject) => {

			const cleanup = () => {
				// eslint-disable-next-line no-use-before-define
				worker.off('error', onError);
				// eslint-disable-next-line no-use-before-define
				worker.off('message', onMessage);
				// eslint-disable-next-line no-use-before-define
				worker.off('exit', onExit);
			};

			const onMessage = (msg: unknown) => {
				if (!isWorkerInitMessage(msg))
					return;

				cleanup();
				resolve(undefined);
			};

			const onError = (err: unknown) => {
				cleanup();
				reject(err);
			};

			const onExit = (exitCode: number) => {
				cleanup();
				reject(new Error(`Worker exited prematurely with exit code ${exitCode}`));
			};

			worker.on('message', onMessage);
			worker.once('error', onError);
			worker.once('exit', onExit);
		});

		return worker;
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
		this.assertMainThread();
		await this.#workerInit;
	}

	protected async _project(event: IEvent): Promise<void> {
		if (isMainThread) {
			this.assertMainThread();

			if (!this.#worker)
				await this.#workerInit;

			return this.remoteProjection._project(event);
		}

		return super._project(event);
	}

	dispose() {
		if (isMainThread) {
			this.#remoteProjection?.[Comlink.releaseProxy]();
			this.#remoteView?.[Comlink.releaseProxy]();
			this.#worker?.terminate();
		}
	}
}
