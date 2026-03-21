import type { IEvent, IProjection } from '../../interfaces/index.js';

export interface IWorkerProjection<TView> extends IProjection<TView> {

	/**
	 * Returns the last projected event, if event-locking state is available.
	 */
	getLastProjectedEvent(): Promise<IEvent | undefined>;

	/**
	 * Projects an event without waiting for view lock readiness.
	 *
	 * Implemented by AbstractWorkerProjection and used by worker RPC wiring
	 * for restore and direct projection paths.
	 */
	_project(event: IEvent): Promise<void>;
}

export interface IWorkerProjectionType<
	TView,
	TProjection extends IWorkerProjection<TView> = IWorkerProjection<TView>
> {
	new(): TProjection;
	readonly workerModulePath: string;
	readonly handles: string[];
}
