import { Worker, MessageChannel } from 'node:worker_threads';
import type {
	IEvent,
	IEventSet,
	IEventStorageReader,
	IEventStore,
	IExtendableLogger,
	ILogger,
	IViewLocker
} from '../interfaces/index.ts';
import type { IProxyProjection, IWorkerProjection, ProxyProjectionParams } from './interfaces/index.ts';
import * as Comlink from 'comlink';
import { nodeEndpoint, createWorker } from './utils/index.ts';
import { assertStringArray, assertString, extractErrorDetails, subscribe } from '../utils/index.ts';
import { describe } from '../Event.ts';
import { InMemoryLock } from '../in-memory/InMemoryLock.ts';

/**
 * Projection being automatically created in the main thread to proxy events
 * and view calls to AbstractWorkerThreadProjection instance
 */
export class WorkerProxyProjection<
	TView,
	TProjection extends IWorkerProjection<TView> = IWorkerProjection<TView>
> implements IProxyProjection<TView> {

	static RESTORE_BATCH_SIZE = 5_000;

	#worker?: Worker;
	readonly #workerInit: Promise<Worker>;
	readonly #remoteProjection: Comlink.Remote<TProjection>;
	readonly #remoteView: Comlink.Remote<TView>;
	readonly #logger?: ILogger;
	readonly #messageTypes: string[];
	#disposed = false;
	viewLocker?: IViewLocker = new InMemoryLock();

	get remoteProjection(): Comlink.Remote<TProjection> {
		return this.#remoteProjection;
	}

	get view(): Comlink.Remote<TView> {
		return this.#remoteView;
	}

	constructor({
		workerModulePath,
		messageTypes,
		logger
	}: ProxyProjectionParams & {
		logger?: IExtendableLogger | ILogger;
	}) {
		assertString(workerModulePath, 'workerModulePath');
		assertStringArray(messageTypes, 'messageTypes');

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

		this.#remoteProjection = Comlink.wrap<TProjection>(nodeEndpoint(projectionPortMain));
		this.#remoteView = Comlink.wrap<TView>(nodeEndpoint(viewPortMain));
	}

	subscribe(eventStore: IEventStore): void {
		subscribe(eventStore, this, {
			masterHandler: this.project,
			messageTypes: this.#messageTypes
		});
	}

	async restore(eventStore: IEventStorageReader): Promise<void> {
		if (this.viewLocker)
			await this.viewLocker.lock();

		await this._restore(eventStore);

		if (this.viewLocker)
			this.viewLocker.unlock();
	}

	/**
	 * Restore view state from not-yet-projected events.
	 *
	 * Events are projected in batches to reduce worker RPC overhead.
	 * The batch size can be configured through {@link WorkerProxyProjection.RESTORE_BATCH_SIZE}.
	 */
	protected async _restore(eventStore: IEventStorageReader): Promise<void> {
		if (!this.#worker)
			await this.#workerInit;

		this.#logger?.debug('retrieving last event projected');
		const lastEvent = await this.#remoteProjection.getLastProjectedEvent();

		this.#logger?.debug(`retrieving ${lastEvent ? `events after ${describe(lastEvent)}` : 'all events'}...`);
		const eventsIterable = eventStore.getEventsByTypes(this.#messageTypes, { afterEvent: lastEvent });

		let eventsCount = 0;
		const startTs = Date.now();
		const batch: IEvent[] = [];

		for await (const event of eventsIterable) {
			batch.push(event);
			eventsCount += 1;

			if (batch.length >= WorkerProxyProjection.RESTORE_BATCH_SIZE) {
				await this._projectBatch(batch);
				batch.length = 0;
			}
		}

		if (batch.length)
			await this._projectBatch(batch);

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
		if (this.viewLocker && !this.viewLocker.ready) {
			this.#logger?.debug(`view is locked, awaiting until it is ready to process ${describe(event)}`);
			await this.viewLocker.once('ready');
			this.#logger?.debug(`view is ready, processing ${describe(event)}`);
		}

		if (!this.#worker)
			await this.#workerInit;

		return this.#remoteProjection.project(event);
	}

	protected _projectBatch(batch: IEventSet): Promise<void> {
		return this.remoteProjection._projectBatch(batch);
	}

	dispose() {
		if (this.#disposed)
			return;

		this.#disposed = true;
		this.#remoteProjection[Comlink.releaseProxy]();
		this.#remoteView[Comlink.releaseProxy]();
		this.#worker?.terminate();
	}
}
