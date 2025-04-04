import { IEventSet } from "./IEventSet";
import { IEventBus } from "./IEventBus";

export interface IEventDispatcher {
	readonly eventBus: IEventBus;
	dispatch(events: IEventSet, meta?: Record<string, any>): Promise<IEventSet>;
}
