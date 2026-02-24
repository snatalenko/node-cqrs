import { Worker, MessageChannel } from 'node:worker_threads';
import type {
	IEvent, IEventLocker, IEventStorageReader, IEventStore, IExtendableLogger, ILogger, IProjection, IViewLocker
} from '../interfaces/index.ts';
import * as Comlink from 'comlink';
import { nodeEndpoint, createWorker } from './utils/index.ts';
import { assertArray, assertString, extractErrorDetails, subscribe } from '../utils/index.ts';
import { describe } from '../Event.ts';
import { InMemoryLock } from '../in-memory/InMemoryLock.ts';
import { IRemoteProjectionApi } from './protocol.ts';

export type WorkerProxyProjectionParams = {

	/**
	 * Required in the main thread to spawn a worker (derived projection module path).
	 * Not used in the worker thread.
	 */
	workerModulePath: string;

	messageTypes: string[];

	logger?: IExtendableLogger | ILogger;
}

/**
 * Projection being automatically created in the main thread to proxy events
 * and view calls to AbstractWorkerThreadProjection instance
 */
export class WorkerProxyProjection<TView extends IEventLocker> implements IProjection<Comlink.Remote<TView>> {

	#worker?: Worker;
	readonly #workerInit: Promise<Worker>;
	readonly #remoteProjection: Comlink.Remote<IRemoteProjectionApi>;
	readonly #remoteView: Comlink.Remote<TView>;
	readonly #logger?: ILogger;
	readonly #messageTypes: string[];
	readonly #viewLocker: IViewLocker = new InMemoryLock();

	get remoteProjection() {
		return this.#remoteProjection;
	}

	get view(): Comlink.Remote<TView> {
		return this.#remoteView;
	}

	constructor({
		workerModulePath,
		messageTypes,
		logger
	}: WorkerProxyProjectionParams) {
		assertString(workerModulePath, 'workerModulePath');
		assertArray(messageTypes, 'messageTypes');

		this.#messageTypes = messageTypes;
		this.#logger = logger && 'child' in logger ? logger.child({ service: new.target.name }) : logger;

		const { port1: projectionPortMain, port2: projectionPort } = new MessageChannel();
		const { port1: viewPortMain, port2: viewPort } = new MessageChannel();

		this.#workerInit = createWorker(workerModulePath, {
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

	subscribe(eventStore: IEventStore): void {
		subscribe(eventStore, this, {
			masterHandler: this.project,
			messageTypes: this.#messageTypes
		});
	}

	async restore(eventStore: IEventStorageReader): Promise<void> {
		if (this.#viewLocker)
			await this.#viewLocker.lock();

		await this._restore(eventStore);

		if (this.#viewLocker)
			this.#viewLocker.unlock();
	}

	/** Restore view state from not-yet-projected events */
	protected async _restore(eventStore: IEventStorageReader): Promise<void> {
		if (!this.#worker)
			await this.#workerInit;

		this.#logger?.debug('retrieving last event projected');
		const lastEvent = await this.view.getLastEvent();

		this.#logger?.debug(`retrieving ${lastEvent ? `events after ${describe(lastEvent)}` : 'all events'}...`);

		const eventsIterable = eventStore.getEventsByTypes(this.#messageTypes, { afterEvent: lastEvent });

		let eventsCount = 0;
		const startTs = Date.now();

		for await (const event of eventsIterable) {
			await this._project(event);
			eventsCount += 1;
		}

		this.#logger?.info(`view restored from ${eventsCount} event(s) in ${Date.now() - startTs} ms`);
	}

	protected _onWorkerError = (error: unknown) => {
		this.#logger?.error('worker error', {
			error: extractErrorDetails(error)
		});
	};

	protected _onWorkerExit = (exitCode: number) => {
		if (exitCode !== 0)
			this.#logger?.error(`worker exited with code ${exitCode}`);
	};

	async ensureWorkerReady(): Promise<void> {
		await this.#workerInit;
	}

	async project(event: IEvent): Promise<void> {
		if (!this.#worker)
			await this.#workerInit;

		if (!this.#viewLocker.ready) {
			this.#logger?.debug(`view is locked, awaiting until it is ready to process ${describe(event)}`);
			await this.#viewLocker.once('ready');
			this.#logger?.debug(`view is ready, processing ${describe(event)}`);
		}

		return this.#remoteProjection.project(event);
	}

	protected async _project(event: IEvent): Promise<void> {
		await this.#remoteProjection._project(event);
	}

	dispose() {
		this.#remoteProjection[Comlink.releaseProxy]();
		this.#remoteView[Comlink.releaseProxy]();
		this.#worker?.terminate();
	}
}
