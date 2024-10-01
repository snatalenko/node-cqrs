import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";
import { EventQueryAfter, EventQueryBefore } from "./IEventStorage";
import { IEventStream } from "./IEventStream";
import { IMessageHandler, IObservable } from "./IObservable";

export interface IEventStore extends IObservable {
	readonly snapshotsSupported?: boolean;

	getNewId(): string | Promise<string>;

	commit(events: IEventSet): Promise<IEventSet>;

	getAllEvents(eventTypes?: Readonly<string[]>): IEventStream;

	getEventsByTypes(eventTypes: Readonly<string[]>, options: EventQueryAfter): IEventStream;

	getAggregateEvents(aggregateId: string, options?: { snapshot?: IEvent }): Promise<IEventSet>;

	getSagaEvents(sagaId: string, options: EventQueryBefore): Promise<IEventSet>;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;

	queue(name: string): IObservable;

	registerSagaStarters(startsWith: string[] | undefined): void;
}
