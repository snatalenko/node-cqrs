import { ILockable, ILockableWithIndication } from "../interfaces";
import { Deferred } from "./utils";

export class InMemoryLock implements ILockableWithIndication {

	#lockMarker: Deferred<void> | undefined;
	#innerLock: ILockable | undefined;

	/**
	 * Indicates if lock is acquired
	 */
	get locked(): boolean {
		return !!this.#lockMarker;
	}

	/**
	 * Creates an instance of InMemoryLock
	 *
	 * @param innerLock ILockable instance that can persist lock state outside of the current process
	 */
	constructor(innerLock?: ILockable) {
		this.#innerLock = innerLock;
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
			if (this.#innerLock)
				await this.#innerLock.lock();
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
		try {
			if (this.#innerLock)
				await this.#innerLock.unlock();
		}
		finally {
			this.#lockMarker?.resolve();
			this.#lockMarker = undefined;
		}
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
