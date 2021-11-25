import Deferred from "./Deferred";

export interface ILockable {
	lock(): Promise<any>;
	unlock(): Promise<any>;
}

export interface ILockableWithState extends ILockable {
	locked: Readonly<boolean>;
	once(event: 'unlocked'): Promise<void>;
}

export class InMemoryLock implements ILockableWithState {

	#lockMarker: Deferred<void> | undefined;
	#innerLock: ILockable | undefined;

	get locked(): boolean {
		return !!this.#lockMarker;
	}

	constructor(innerLock?: ILockable) {
		this.#innerLock = innerLock;
	}

	async lock() {
		while (this.locked)
			await this.once('unlocked');

		try {
			this.#lockMarker = new Deferred();
			this.#innerLock?.lock();
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

	async unlock() {
		try {
			await this.#innerLock?.unlock();
		}
		finally {
			this.#lockMarker?.resolve();
			this.#lockMarker = undefined;
		}
	}

	once(event: 'unlocked') {
		if (event !== 'unlocked')
			throw new TypeError(`Unexpected event type: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
