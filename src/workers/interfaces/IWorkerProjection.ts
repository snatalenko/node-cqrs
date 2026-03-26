import type { IEvent, IProjection } from '../../interfaces/index.js';

export interface IWorkerProjection<TView> extends IProjection<TView> {

	/**
	 * Returns the last projected event, if event-locking state is available.
	 */
	getLastProjectedEvent(): Promise<IEvent | undefined>;

	/**
	 * Projects an event without waiting for view lock readiness.
	 *
	 * @internal Expose protected projection path for worker RPC wiring
	 */
	_project(event: IEvent, meta?: Record<string, any>): Promise<void>;
}

export interface IWorkerProjectionType<
	TView,
	TProjection extends IWorkerProjection<TView> = IWorkerProjection<TView>
> {
	new(): TProjection;
	readonly workerModulePath: string;
	readonly handles: string[];
}
