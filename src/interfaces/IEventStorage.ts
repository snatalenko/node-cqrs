import { Identifier } from "./Identifier";
import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";
import { IEventStream } from "./IEventStream";

export type EventQueryAfter = {
	/** Get events emitted after this specific event */
	afterEvent?: IEvent;
}

export type EventQueryBefore = {
	/** Get events emitted before this specific event */
	beforeEvent?: IEvent;
}

export interface IEventStorage {
	/**
	 * Create unique identifier 
	 */
	getNewId(): Identifier | Promise<Identifier>;

	commitEvents(events: IEventSet): Promise<IEventSet>;

	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream;

	getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): Promise<IEventSet> | IEventStream;

	getSagaEvents(sagaId: Identifier, options: EventQueryBefore): Promise<IEventSet> | IEventStream;
}
