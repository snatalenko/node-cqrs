import { isMainThread } from 'node:worker_threads';
import { AbstractProjection } from '../AbstractProjection.ts';
import {
	workerProxyFactory as createWorkerProxyFactory,
	createWorkerInstance as createWorkerProjectionInstance,
	type ProjectionView
} from './utils/index.ts';
import type { IWorkerProjection, IWorkerProjectionType } from './interfaces/index.ts';
import type { IContainer, IEvent } from '../interfaces/index.ts';

/**
 * Projection base class that can run projection handlers and the associated view in a worker thread
 * to isolate CPU-heavy work and keep the main thread responsive
 */
export abstract class AbstractWorkerProjection<TView>
	extends AbstractProjection<TView>
	implements IWorkerProjection<TView> {

	/**
	 * In a worker thread, creates and exposes the projection singleton.
	 */
	static createInstanceInWorkerThread<V, T extends AbstractWorkerProjection<V>>(
		this: new () => T,
		factory?: () => T
	): T | undefined {
		if (isMainThread)
			return undefined;

		const projectionMethodsToWire = [
			'project',
			'_project',
			'ping',
			'getLastProjectedEvent'
		] as Extract<keyof T, string>[];

		if (factory)
			return createWorkerProjectionInstance(factory, projectionMethodsToWire);

		return createWorkerProjectionInstance(this, projectionMethodsToWire);
	}

	/**
	 * Creates a factory that returns a `WorkerProxyProjection` for this projection type.
	 * Use it in the main thread (for example, `builder.registerProjection(MyProjection.workerProxyFactory)`),
	 * so events are proxied to the worker instance while exposing the remote view API.
	 */
	static workerProxyFactory<
		TProjection extends IWorkerProjection<any>,
		TContainer extends IContainer = IContainer,
		TView = ProjectionView<TProjection>
	>(this: IWorkerProjectionType<TView, TProjection>, container?: TContainer) {
		return createWorkerProxyFactory(this)(container);
	}

	static get workerModulePath(): string {
		throw new Error('not implemented');
	}

	/** @internal Responds to a ping from the main thread to confirm the worker is alive */
	// eslint-disable-next-line class-methods-use-this
	public ping(): true {
		return true;
	}

	/** @internal Expose protected projection path for worker RPC wiring */
	public override _project(event: IEvent): Promise<void> {
		return super._project(event);
	}

	/**
	 * Returns the last projected event if the view implements IEventLocker, otherwise undefined.
	 */
	public async getLastProjectedEvent(): Promise<IEvent | undefined> {
		return this._eventLocker?.getLastEvent();
	}
}
