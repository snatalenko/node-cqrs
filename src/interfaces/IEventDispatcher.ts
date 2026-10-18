import type { IEventSet } from './IEventSet.ts';
import type { IEventBus } from './IEventBus.ts';
import type { IEventMeta } from './IEventMeta.ts';

export interface IEventDispatcher {
	readonly eventBus: IEventBus;

	/** Dispatch events through a routed pipeline and publish to the shared eventBus */
	dispatch(events: IEventSet, meta?: IEventMeta): Promise<IEventSet>;

	/** Get a promise that resolves when all in-flight fire-and-forget event bus publishes have settled */
	drain(): Promise<unknown>;
}
