import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { AbstractProjection } from '../AbstractProjection.ts';
import * as Comlink from 'comlink';
import { nodeEndpoint } from './utils/index.ts';
import { type IRemoteProjectionApi, type WorkerInitMessage, isWorkerData } from './protocol.ts';
import { WorkerProxyProjection } from './WorkerProxyProjection.ts';

/**
 * Projection base class that can run projection handlers and the associated view in a worker thread
 * to isolate CPU-heavy work and keep the main thread responsive
 */
export abstract class AbstractWorkerProjection<TView> extends AbstractProjection<TView> {

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

	/**
	 * Creates a factory that returns a `WorkerProxyProjection` for this projection type.
	 * Use it in the main thread (for example, `builder.registerProjection(MyProjection.workerProxyFactory)`),
	 * so events are proxied to the worker instance while exposing the remote view API.
	 */
	static get workerProxyFactory() {
		const ProjectionType = this as typeof AbstractWorkerProjection;
		return () => new WorkerProxyProjection<any>({
			workerModulePath: ProjectionType.workerModulePath,
			messageTypes: ProjectionType.handles
		});
	}

	static get workerModulePath(): string {
		throw new Error('not implemented');
	}

	/** Responds to a ping from the main thread to confirm the worker is alive */
	// eslint-disable-next-line class-methods-use-this
	protected _pong(): true {
		return true;
	}
}
