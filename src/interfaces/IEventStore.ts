import { Identifier } from "./Identifier";
import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";
import { EventQueryAfter, EventQueryBefore } from "./IEventStorage";
import { IEventStream } from "./IEventStream";
import { IMessageHandler, IObservable } from "./IObservable";

export interface IEventStore extends IObservable {
	readonly snapshotsSupported?: boolean;

	getNewId(): Identifier | Promise<Identifier>;

	commit(events: IEventSet): Promise<IEventSet>;

	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream;

	getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): IEventStream;

	getSagaEvents(sagaId: Identifier, options: EventQueryBefore): IEventStream;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;

	queue(name: string): IObservable;

	registerSagaStarters(startsWith: string[] | undefined): void;
}
