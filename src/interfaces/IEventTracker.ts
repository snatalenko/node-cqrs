import type { IEvent } from './IEvent.ts';
import type { Identifier } from './Identifier.ts';
import { isObject } from './isObject.ts';

export type EventTrackerWaitOptions = {

	/**
	 * Maximum time to wait, in milliseconds. `0` disables the timeout.
	 * When not specified, the implementation default is used.
	 */
	timeout?: number;

	/**
	 * Signal to stop waiting. Aborting does not affect event processing.
	 */
	signal?: AbortSignal;
};

/**
 * Interface for tracking event processing state to prevent concurrent processing
 * by multiple processes, and to await until specific events are projected.
 *
 * Waits are resolved once events are marked as projected through the same instance.
 */
export interface IEventTracker {

	/**
	 * Retrieves the last projected event,
	 * allowing the projection state to be restored from subsequent events.
	 */
	getLastEvent(): Promise<IEvent | undefined> | IEvent | undefined;

	/**
	 * Marks an event as projecting to prevent it from being processed
	 * by another projection instance using the same storage.
	 *
	 * @returns `false` if the event is already being processed or has been processed.
	 */
	tryMarkAsProjecting(event: IEvent): Promise<boolean> | boolean;

	/**
	 * Marks an event as projected.
	 */
	markAsProjected(event: IEvent): Promise<void> | void;

	/**
	 * Records an event as the last projected event (restore checkpoint).
	 */
	markAsLastEvent(event: IEvent): Promise<void> | void;

	/**
	 * Waits until events with the given IDs are projected.
	 *
	 * Guarantees completion only: once resolved, changes made by the given events are visible through the view.
	 * It does not guarantee that the view has not been changed by subsequent events since then.
	 *
	 * Callers are responsible for passing IDs of events handled by the projection:
	 * waiting for an event the projection does not handle lasts until the timeout.
	 * Rejects when projection of any of the events fails, on timeout, or when the wait is aborted.
	 */
	waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void>;

	/**
	 * Marks an event projection as failed, rejecting the in-process `waitFor` calls awaiting it.
	 */
	markAsFailed?(event: IEvent, error: unknown): void;
}

const EVENT_TRACKER_METHODS = ['getLastEvent', 'tryMarkAsProjecting', 'markAsProjected', 'markAsLastEvent', 'waitFor'];

export const isEventTracker = (obj: unknown): obj is IEventTracker =>
	(isObject(obj) && EVENT_TRACKER_METHODS.every(name => name in obj))
	|| (typeof obj === 'function' && EVENT_TRACKER_METHODS.every(name => typeof (obj as any)[name] === 'function'));
