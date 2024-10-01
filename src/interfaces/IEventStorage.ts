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
	getNewId(): string | Promise<string>;

	commitEvents(events: IEventSet): Promise<IEventSet>;

	getEvents(eventTypes?: Readonly<string[]>): IEventStream;

	getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter):
		IEventStream;

	getAggregateEvents(aggregateId: string, options?: { snapshot?: IEvent }): Promise<IEventSet>;

	getSagaEvents(sagaId: string, options: EventQueryBefore): Promise<IEventSet>;
}
