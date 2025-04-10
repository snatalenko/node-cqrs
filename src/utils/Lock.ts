import { Deferred } from './Deferred';

/**
 * Provides a simple asynchronous lock mechanism.
 * Useful for ensuring that only one asynchronous operation proceeds at a time
 * for a specific resource or section of code.
 */
export class Lock {

	#deferred?: Deferred<void>;

	get isLocked(): boolean {
		return !(this.#deferred?.settled ?? true);
	}

	/**
	 * Wait until lock is released, then acquire it
	 */
	async acquire(): Promise<void> {
		// the below code cannot be replaced with `await this.unblocked()`
		// since check of `isLocked` and `this.#deferred` assignment should happen within 1 callback
		while (this.isLocked)
			await this.#deferred?.promise;

		this.#deferred = new Deferred();
	}

	/**
	 * Returns a promise that is resolved once lock is released
	 */
	async unblocked(): Promise<void> {
		while (this.isLocked)
			await this.#deferred?.promise;
	}

	release(): void {
		this.#deferred?.resolve();
		this.#deferred = undefined;
	}

	/**
	 * Execute callback with lock acquired, then release lock
	 */
	async runLocked(callback: () => Promise<void>) {
		try {
			await this.acquire();
			await callback();
		}
		finally {
			this.release();
		}
	}
}
