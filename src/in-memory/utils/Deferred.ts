/**
 * Deferred promise that must be resolved from outside
 */
export class Deferred<TDeferredValue> {

	readonly promise: Promise<TDeferredValue | void>;

	get resolved() {
		return this.#resolved;
	}

	get rejected() {
		return this.#rejected;
	}

	get settled() {
		return this.#resolved || this.#rejected;
	}

	#resolve!: (value?: TDeferredValue | PromiseLike<TDeferredValue>) => void;
	#resolved: boolean = false;
	#reject!: (reason?: any) => void;
	#rejected: boolean = false;

	constructor() {
		this.promise = new Promise<TDeferredValue | void>((resolve, reject) => {
			this.#resolve = resolve;
			this.#reject = reject;
		});
	}

	resolve(value?: TDeferredValue) {
		this.#resolve(value);
		this.#resolved = true;
	}

	reject(reason?: any) {
		this.#reject(reason);
		this.#rejected = true;
	}
}
