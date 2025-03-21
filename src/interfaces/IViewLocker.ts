import { isObject } from "./isObject";

/**
 * Interface for managing view restoration state to prevent early access to an inconsistent view
 * or concurrent restoration by another process.
 */
export interface IViewLocker {

	/**
	 * Indicates whether the view is fully restored and ready to accept new event projections.
	 */
	ready: boolean;

	/**
	 * Locks the view to prevent external read/write operations.
	 * 
	 * @returns `true` if the lock is successfully acquired, `false` otherwise.
	 */
	lock(): Promise<boolean> | boolean;

	/**
	 * Unlocks the view, allowing external read/write operations to resume.
	 */
	unlock(): Promise<void> | void;

	/**
	 * Waits until the view is fully restored and ready to accept new events.
	 * 
	 * @param eventType The event type to listen for (`"ready"`).
	 * @returns A promise that resolves when the view is ready.
	 */
	once(eventType: "ready"): Promise<void>;
}

/**
 * Checks if a given object conforms to the `IViewLocker` interface.
 * 
 * @param view The object to check.
 * @returns `true` if the object implements `IViewLocker`, `false` otherwise.
 */
export const isViewLocker = (view: unknown): view is IViewLocker =>
	isObject(view)
	&& 'ready' in view
	&& 'lock' in view
	&& 'unlock' in view
	&& 'once' in view;
