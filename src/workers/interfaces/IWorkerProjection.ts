import type { IEvent, IEventSet, IProjection } from '../../interfaces/index.js';

export interface IWorkerProjection<TView> extends IProjection<TView> {

	/**
	 * Returns the last projected event, if event-locking state is available.
	 */
	getLastProjectedEvent(): Promise<IEvent | undefined>;

	/**
	 * Project restore events in batches to avoid one Comlink roundtrip per event,
	 * recording the last projected event as the restore checkpoint
	 *
	 * @internal
	 */
	_restoreBatch(events: IEventSet): Promise<void>;
}

export interface IWorkerProjectionType<
	TView,
	TProjection extends IWorkerProjection<TView> = IWorkerProjection<TView>
> {
	new(): TProjection;
	readonly workerModulePath: string;
	readonly handles: string[];
}
