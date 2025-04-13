import { IEvent } from './IEvent';
import { isObject } from './isObject';

/**
 * Represents a wrapper for an event that can optionally contain additional metadata.
 * Used to extend event processing with context-specific data required by processors.
 */
export type DispatchPipelineEnvelope = {

	/**
	 * Origin of the event. Can be used to distinguish between events coming from different sources.
	 */
	origin?: 'external' | 'internal';

	event?: IEvent;
}

/**
 * A batch of event envelopes. Can contain custom envelope types extending EventEnvelope.
 */
export type DispatchPipelineBatch<T extends DispatchPipelineEnvelope = DispatchPipelineEnvelope> = Readonly<Array<T>>;

/**
 * Defines a processor that operates on a batch of event envelopes.
 * Allows transformations, side-effects, or filtering of events during dispatch.
 */
export interface IDispatchPipelineProcessor<T extends DispatchPipelineEnvelope = {}> {
	process(batch: DispatchPipelineBatch<T>): Promise<DispatchPipelineBatch<T>>;
	revert?(batch: DispatchPipelineBatch<T>): Promise<void>;
}

export const isDispatchPipelineProcessor = (obj: unknown): obj is IDispatchPipelineProcessor =>
	isObject(obj)
	&& 'process' in obj
	&& typeof (obj as IDispatchPipelineProcessor).process === 'function';
