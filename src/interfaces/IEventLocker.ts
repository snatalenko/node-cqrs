import { IEvent } from "./IEvent";
import { isObject } from "./isObject";

/**
 * Interface for tracking event processing state to prevent concurrent processing
 * by multiple processes.
 */
export interface IEventLocker {

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
}

export const isEventLocker = (view: unknown): view is IEventLocker =>
	isObject(view)
	&& 'getLastEvent' in view
	&& 'tryMarkAsProjecting' in view
	&& 'markAsProjected' in view;
