import { IEventStore } from "./IEventStore";
import { IObserver } from "./IObserver";

export interface IEventReceptor extends IObserver {
	subscribe(eventStore: IEventStore): void;
}
