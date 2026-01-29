import type { IEventSet } from './IEventSet.ts';
import type { IEventBus } from './IEventBus.ts';

export interface IEventDispatcher {
	readonly eventBus: IEventBus;
	dispatch(events: IEventSet, meta?: Record<string, any>): Promise<IEventSet>;
}
