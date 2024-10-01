export interface IProjectionView {

	/**
	 * Indicates if view is ready for new events projecting
	 */
	ready: boolean;

	/**
	 * Lock the view for external reads/writes
	 */
	lock(): Promise<boolean> | boolean;

	/**
	 * Unlock external read/write operations
	 */
	unlock(): Promise<void> | void;

	/**
	 * Wait till the view is ready to accept new events
	 */
	once(eventType: "ready"): Promise<void>;
}
