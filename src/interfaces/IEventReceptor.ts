import type { IEventStore } from './IEventStore.ts';
import type { IObserver } from './IObserver.ts';

export interface IEventReceptor extends IObserver {
	subscribe(eventStore: IEventStore): void;
}
