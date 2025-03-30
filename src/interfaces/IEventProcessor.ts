import { IEvent } from "./IEvent";

/**
 * Represents a wrapper for an event that can optionally contain additional metadata.
 * Used to extend event processing with context-specific data required by processors.
 */
type EventEnvelope = {
	event?: IEvent;
}

/**
 * A batch of event envelopes. Can contain custom envelope types extending EventEnvelope.
 */
export type EventBatch<T extends EventEnvelope = EventEnvelope> = Readonly<Array<T>>;

/**
 * Defines a processor that operates on a batch of event envelopes.
 * Allows transformations, side-effects, or filtering of events during dispatch.
 */
export interface IEventProcessor<T extends EventEnvelope = {}> {
	process(batch: EventBatch<T>): Promise<EventBatch<T>>;
	revert?(batch: EventBatch<T>): Promise<void>;
}

