import { Deferred } from "./utils";

export class InMemoryLock {

	#lockMarker: Deferred<void> | undefined;

	/**
	 * Indicates if lock is acquired
	 */
	get locked(): boolean {
		return !!this.#lockMarker;
	}

	/**
	 * Acquire the lock on the current instance.
	 * Resolves when the lock is successfully acquired
	 */
	async lock(): Promise<void> {
		while (this.locked)
			await this.once('unlocked');

		try {
			this.#lockMarker = new Deferred();
		}
		catch (err: any) {
			try {
				await this.unlock();
			}
			catch (unlockErr: any) {
				// unlocking errors are ignored
			}
			throw err;
		}
	}

	/**
	 * Release the lock acquired earlier
	 */
	async unlock(): Promise<void> {
		this.#lockMarker?.resolve();
		this.#lockMarker = undefined;
	}

	/**
	 * Wait until the lock is released.
	 * Resolves immediately if the lock is not acquired
	 */
	once(event: 'unlocked'): Promise<void> {
		if (event !== 'unlocked')
			throw new TypeError(`Unexpected event type: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
