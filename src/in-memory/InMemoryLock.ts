import type { IViewLocker } from '../interfaces/IViewLocker.js';
import { Deferred } from '../utils/index.ts';

export class InMemoryLock implements IViewLocker {

	#lockMarker: Deferred<void> | undefined;

	/**
	 * Indicates if lock is acquired
	 */
	get locked(): boolean {
		return !!this.#lockMarker;
	}

	get ready(): boolean {
		return !this.locked;
	}

	/**
	 * Acquire the lock on the current instance.
	 * Resolves when the lock is successfully acquired
	 */
	async lock(): Promise<boolean> {
		while (this.locked)
			await this.once('ready');

		this.#lockMarker = new Deferred();
		return this.locked;
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
	once(event: 'ready'): Promise<void> {
		if (event !== 'ready')
			throw new TypeError(`Unexpected event type: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
