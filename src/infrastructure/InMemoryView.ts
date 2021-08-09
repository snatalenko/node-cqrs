'use strict';

import { IConcurrentView, Identifier, IEvent, TSnapshot } from "../interfaces";
import { sizeOf } from '../utils';

const nextCycle = () => new Promise(setImmediate);

/**
 * Update given value with an update Cb and return updated value.
 * Wrapper is needed for backward compatibility with update methods that were modifying the passed in objects directly
 */
function applyUpdate<T>(view: T | undefined, update: (r?: T) => T | undefined): T | undefined {
	const valueReturnedByUpdate = update(view);
	return valueReturnedByUpdate === undefined ?
		view :
		valueReturnedByUpdate;
}

/**
 * In-memory Projection View, which suspends get()'s until it is ready
 */
export default class InMemoryView<TRecord> implements IConcurrentView {

	#map: Map<Identifier, TRecord | undefined> = new Map();

	#ready: boolean = true;
	#lockPromise: Promise<void> = Promise.resolve();
	#unlock?: (value?: void) => void;

	#lastEvent: IEvent | undefined;
	#schemaVersion: string = '';
	#asyncWrites: boolean;

	/**
	 * Whether the view is restored
	 */
	get ready(): boolean {
		return this.#ready;
	}

	/** Number of records in the View */
	get size(): number {
		return this.#map.size;
	}

	/**
	 * Creates an instance of InMemoryView
	 */
	constructor({ asyncWrites = false, snapshot }: {
		/** Indicates if writes should be submitted asynchronously */
		asyncWrites?: boolean,
		snapshot?: TSnapshot<Array<[Identifier, TRecord | undefined]>>
	} = {}) {
		this.#asyncWrites = asyncWrites;

		if (snapshot)
			this.loadSnapshot(snapshot);

		// explicitly bind the `get` method to this object for easier using in Promises
		Object.defineProperty(this, this.get.name, {
			value: this.get.bind(this)
		});
	}

	async getLastEvent(): Promise<IEvent<any> | undefined> {
		return this.#lastEvent;
	}

	async saveLastEvent(event: IEvent<any>): Promise<void> {
		this.#lastEvent = event;
	}

	async getSchemaVersion(): Promise<string> {
		return this.#schemaVersion;
	}

	async changeSchemaVersion(version: string): Promise<void> {
		if (this.#schemaVersion === version)
			return;

		this.#schemaVersion = version;
		this.#lastEvent = undefined;
		this.#map = new Map();
	}

	makeSnapshot(): TSnapshot<Array<[Identifier, TRecord | undefined]>> | undefined {
		if (!this.#lastEvent)
			return undefined;

		return {
			schemaVersion: this.#schemaVersion,
			lastEvent: this.#lastEvent,
			data: Array.from(this.#map.entries())
		};
	}

	loadSnapshot(snapshot: TSnapshot<Array<[Identifier, TRecord | undefined]>>) {
		this.#schemaVersion = String(snapshot.schemaVersion);
		this.#lastEvent = snapshot.lastEvent;
		this.#map = new Map(snapshot.data);
	}

	/**
	 * Lock the view to prevent concurrent modifications
	 */
	async lock() {
		if (this.ready === false)
			await this.once('ready');

		this.#lockPromise = new Promise(resolve => {
			this.#unlock = () => {
				resolve();
			};
		});

		this.#ready = false;
		return true;
	}

	/**
	 * Release the lock
	 */
	async unlock() {
		this.#ready = true;
		if (typeof this.#unlock === 'function')
			return this.#unlock();
	}

	/**
	 * Create a Promise which will resolve to a first emitted event of a given type
	 */
	once(eventType: 'ready'): Promise<any> {
		if (eventType !== 'ready')
			throw new TypeError(`Unexpected event type: ${eventType}`);

		return this.#lockPromise;
	}

	/**
	 * Check if view contains a record with a given key.
	 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
	 *
	 * @deprecated Use `async get()` instead
	 */
	has(key: Identifier): boolean {
		return this.#map.has(key);
	}

	/**
	 * Get record with a given key; await until the view is restored
	 */
	async get(key: Identifier, options?: { nowait?: boolean }): Promise<TRecord | undefined> {
		if (!key)
			throw new TypeError('key argument required');

		if (!this.#ready && !(options && options.nowait))
			await this.once('ready');

		await nextCycle();

		return this.#map.get(key);
	}

	/**
	 * Get all records matching an optional filter
	 */
	async getAll(filter?: (r: TRecord | undefined, i: Identifier) => boolean):
		Promise<Array<[Identifier, TRecord | undefined]>> {
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when defined, must be a Function');

		if (!this.#ready)
			await this.once('ready');

		await nextCycle();

		const r: Array<[Identifier, TRecord | undefined]> = [];
		for (const entry of this.#map.entries()) {
			if (!filter || filter(entry[1], entry[0]))
				r.push(entry);
		}

		return r;
	}

	/**
	 * Create record with a given key and value
	 */
	async create(key: Identifier, value: TRecord = {} as TRecord) {
		if (!key)
			throw new TypeError('key argument required');
		if (typeof value === 'function')
			throw new TypeError('value argument must be an instance of an Object');

		if (this.#asyncWrites)
			await nextCycle();

		if (this.#map.has(key))
			throw new Error(`Key '${key}' already exists`);

		this.#map.set(key, value);
	}

	/**
	 * Update existing view record
	 */
	async update(key: Identifier, update: (r?: TRecord) => TRecord) {
		if (!key)
			throw new TypeError('key argument required');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		if (!this.#map.has(key))
			throw new Error(`Key '${key}' does not exist`);

		return this._update(key, update);
	}

	/**
	 * Update existing view record or create new
	 */
	async updateEnforcingNew(key: Identifier, update: (r?: TRecord) => TRecord) {
		if (!key)
			throw new TypeError('key argument required');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		if (!this.#map.has(key))
			return this.create(key, applyUpdate(undefined, update));

		return this._update(key, update);
	}

	/**
	 * Update all records that match filter criteria
	 */
	async updateAll(filter: (r?: TRecord) => boolean, update: (r?: TRecord) => TRecord) {
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when specified, must be a Function');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		for (const [key, value] of this.#map) {
			if (!filter || filter(value))
				await this._update(key, update);
		}
	}

	/**
	 * Update existing record
	 */
	private async _update(key: Identifier, update: (r?: TRecord) => TRecord) {
		const value = this.#map.get(key);
		const updatedValue = applyUpdate(value, update);

		if (this.#asyncWrites)
			await nextCycle();

		this.#map.set(key, updatedValue);
	}

	/**
	 * Delete record
	 */
	async delete(key: Identifier) {
		if (!key)
			throw new TypeError('key argument required');

		if (this.#asyncWrites)
			await nextCycle();

		this.#map.delete(key);
	}

	/**
	 * Delete all records that match filter criteria
	 */
	async deleteAll(filter: (r?: TRecord) => boolean) {
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when specified, must be a Function');

		for (const [key, value] of this.#map) {
			if (!filter || filter(value))
				await this.delete(key);
		}
	}

	/**
	 * Get view summary as string
	 */
	toString(): string {
		return `${this.size} record${this.size !== 1 ? 's' : ''}, ${sizeOf(this.#map)} bytes`;
	}
}
