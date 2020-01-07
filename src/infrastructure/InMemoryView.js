'use strict';

const { sizeOf } = require('../utils');

/**
 * Update given value with an update Cb and return updated value.
 * Wrapper is needed for backward compatibility with update methods that were modifying the passed in objects directly
 *
 * @template TObjectValue
 * @param {TObjectValue} view
 * @param {function (TObjectValue): TObjectValue} update
 * @returns {TObjectValue}
 */
const applyUpdate = (view, update) => {
	const valueReturnedByUpdate = update(view);
	return valueReturnedByUpdate === undefined ?
		view :
		valueReturnedByUpdate;
};

/**
 * In-memory Projection View, which suspends get()'s until it is ready
 *
 * @class InMemoryView
 * @template TRecord
 * @implements {IInMemoryView<TRecord>}
 */
class InMemoryView {

	/**
	 * Whether the view is restored
	 *
	 * @type {boolean}
	 */
	get ready() {
		return this._ready;
	}

	/**
	 * Number of records in the View
	 *
	 * @type {number}
	 * @readonly
	 */
	get size() {
		return this._map.size;
	}

	/**
	 * Creates an instance of InMemoryView
	 */
	constructor() {
		/** @type {Map<Identifier, TRecord>} */
		this._map = new Map();

		// explicitly bind the `get` method to this object for easier using in Promises
		Object.defineProperty(this, this.get.name, {
			value: this.get.bind(this)
		});
	}

	/**
	 * Lock the view to prevent concurrent modifications
	 */
	async lock() {
		if (this.ready === false)
			await this.once('ready');

		this._lockPromise = new Promise(resolve => {
			this._unlock = resolve;
		});

		this._ready = false;
	}

	/**
	 * Release the lock
	 */
	async unlock() {
		this._ready = true;
		if (typeof this._unlock === 'function')
			this._unlock();
	}

	/**
	 * Check if view contains a record with a given key.
	 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
	 *
	 * @deprecated Use `async get()` instead
	 *
	 * @param {Identifier} key
	 * @returns {boolean}
	 */
	has(key) {
		return this._map.has(key);
	}

	/**
	 * Get record with a given key; await until the view is restored
	 *
	 * @param {Identifier} key
	 * @param {object} [options]
	 * @param {boolean} [options.nowait] Skip waiting until the view is restored/ready
	 * @returns {Promise<TRecord>}
	 */
	async get(key, options) {
		if (!key) throw new TypeError('key argument required');

		if (!this._ready && !(options && options.nowait))
			await this.once('ready');

		return this._map.get(key);
	}

	/**
	 * Get all records matching an optional filter
	 *
	 * @param {function(TRecord, Identifier): boolean} [filter]
	 */
	async getAll(filter) {
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when defined, must be a Function');

		if (!this._ready)
			await this.once('ready');

		const r = [];
		for (const entry of this._map.entries()) {
			if (!filter || filter(entry[1], entry[0]))
				r.push(entry);
		}

		return r;
	}

	/**
	 * Create record with a given key and value
	 *
	 * @param {Identifier} key
	 * @param {TRecord} [value]
	 */
	create(key, value = {}) {
		if (!key) throw new TypeError('key argument required');
		if (typeof value === 'function') throw new TypeError('value argument must be an instance of an Object');

		if (this._map.has(key))
			throw new Error(`Key '${key}' already exists`);

		this._map.set(key, value);
	}

	/**
	 * Update existing view record
	 *
	 * @param {Identifier} key
	 * @param {function(TRecord): TRecord} update
	 */
	update(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		if (!this._map.has(key))
			throw new Error(`Key '${key}' does not exist`);

		this._update(key, update);
	}

	/**
	 * Update existing view record or create new
	 *
	 * @param {Identifier} key
	 * @param {function(TRecord): TRecord} update
	 */
	updateEnforcingNew(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		if (!this._map.has(key))
			return this.create(key, applyUpdate(undefined, update));

		return this._update(key, update);
	}

	/**
	 * Update all records that match filter criteria
	 *
	 * @param {function(TRecord): boolean} [filter]
	 * @param {function(TRecord): TRecord} update
	 */
	updateAll(filter, update) {
		if (filter && typeof filter !== 'function') throw new TypeError('filter argument, when specified, must be a Function');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		for (const [key, value] of this._map) {
			if (!filter || filter(value))
				this._update(key, update);
		}
	}

	/**
	 * Update existing record
	 *
	 * @private
	 * @param {Identifier} key
	 * @param {function(TRecord): TRecord} update
	 */
	_update(key, update) {
		const value = this._map.get(key);
		this._map.set(key, applyUpdate(value, update));
	}

	/**
	 * Delete record
	 *
	 * @param {Identifier} key
	 */
	delete(key) {
		if (!key) throw new TypeError('key argument required');

		this._map.delete(key);
	}

	/**
	 * Delete all records that match filter criteria
	 *
	 * @param {function(TRecord): boolean} [filter]
	 */
	deleteAll(filter) {
		if (filter && typeof filter !== 'function') throw new TypeError('filter argument, when specified, must be a Function');

		for (const [key, value] of this._map) {
			if (!filter || filter(value))
				this._map.delete(key);
		}
	}

	/**
	 * Mark view as 'ready' when it's restored by projection
	 *
	 * @deprecated Use `unlock()`
	 */
	markAsReady() {
		this.unlock();
	}

	/**
	 * Create a Promise which will resolve to a first emitted event of a given type
	 *
	 * @param {"ready"} eventType
	 * @returns {Promise<any>}
	 */
	once(eventType) {
		if (eventType !== 'ready')
			throw new TypeError(`Unexpected event type: ${eventType}`);

		return this._lockPromise;
	}

	/**
	 * Get view summary as string
	 *
	 * @returns {string}
	 */
	toString() {
		return `${this.size} record${this.size !== 1 ? 's' : ''}, ${sizeOf(this._map)} bytes`;
	}
}

module.exports = InMemoryView;
