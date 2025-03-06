import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";
import { EventQueryAfter, EventQueryBefore } from "./IEventStorage";
import { IEventStream } from "./IEventStream";
import { IMessageHandler, IObservable } from "./IObservable";

export interface IEventStore extends IObservable {
	readonly snapshotsSupported?: boolean;

	getNewId(): string | Promise<string>;

	commit(events: IEventSet): Promise<IEventSet>;

	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream;

	getAggregateEvents(aggregateId: string, options?: { snapshot?: IEvent }): IEventStream;

	getSagaEvents(sagaId: string, options: EventQueryBefore): IEventStream;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;

	queue(name: string): IObservable;

	registerSagaStarters(startsWith: string[] | undefined): void;
}
