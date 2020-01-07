declare interface IConcurrentView {

	/**
	 * Indicates if concurrent view is ready for external operations
	 */
	ready: boolean;

	/**
	 * Lock the view for external reads/writes
	 */
	lock(): Promise<void>;

	/**
	 * Unlock external read/write operations
	 */
	unlock(): Promise<void>;

	/**
	 * Wait until the view is unlocked
	 */
	once(eventType: "ready"): Promise<void>;
}
