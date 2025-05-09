import { Deferred } from './Deferred';

export class Lock {

	/**
	 * Indicates that global lock acquiring is started,
	 * so all other locks should wait to ensure that named lock raised after global don't squeeze before it
	 */
	#globalLockAcquiringLock?: Deferred<void>;

	/**
	 * Indicates that global lock is acquired, all others should wait
	 */
	#globalLock?: Deferred<void>;

	/**
	 * Hash of named locks. Each named lock block locks with same name and the global one
	 */
	#namedLocks: Map<string, Deferred<void>> = new Map();

	#getAnyBlockingLock(id?: string): Deferred<void> | undefined {
		return this.#globalLock ?? (
			id ?
				this.#namedLocks.get(id) :
				this.#namedLocks.values().next().value
		);
	}


	isLocked(name?: string): boolean {
		return !!this.#getAnyBlockingLock(name);
	}

	/**
	 * Acquire named or global lock
	 *
	 * @returns Promise that resolves once lock is acquired
	 */
	async acquire(name?: string): Promise<void> {

		while (this.#globalLockAcquiringLock)
			await this.#globalLockAcquiringLock.promise;

		const isGlobal = !name;
		if (isGlobal)
			this.#globalLockAcquiringLock = new Deferred();

		// the below code cannot be replaced with `await this.waitForUnlock()`
		// since check of `isLocked` and `this.#deferred` assignment should happen within 1 callback
		// while `async waitForUnlock(..) await..` creates one extra promise callback
		while (this.isLocked(name))
			await this.#getAnyBlockingLock(name)?.promise;

		if (name)
			this.#namedLocks.set(name, new Deferred());
		else
			this.#globalLock = new Deferred();

		if (isGlobal) {
			this.#globalLockAcquiringLock?.resolve();
			this.#globalLockAcquiringLock = undefined;
		}
	}

	/**
	 * @returns Promise that resolves once lock is released
	 */
	async waitForUnlock(name?: string): Promise<void> {
		while (this.isLocked(name))
			await this.#getAnyBlockingLock(name)?.promise;
	}

	/**
	 * Release named or global lock
	 */
	release(name?: string): void {
		if (name) {
			this.#namedLocks.get(name)?.resolve();
			this.#namedLocks.delete(name);
		}
		else {
			this.#globalLock?.resolve();
			this.#globalLock = undefined;
		}
	}

	/**
	 * Execute callback with lock acquired, then release lock
	 */
	async runExclusively<T>(name: string | undefined, callback: () => Promise<T> | T): Promise<T> {
		try {
			await this.acquire(name);
			return await callback();
		}
		finally {
			this.release(name);
		}
	}
}
