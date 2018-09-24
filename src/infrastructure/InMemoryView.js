'use strict';

const EventEmitter = require('events');
const { sizeOf } = require('../utils');

function strMapToObj(strMap) {
	const obj = Object.create(null);
	for (const [k, v] of strMap)
		obj[k] = v;
	return obj;
}

/**
 * Update given value with an update Cb and return updated value.
 * Wrapper is needed for backward compatibility with update methods that were modifying the passed in objects directly
 *
 * @template TObjectValue
 * @param {TObjectValue} view
 * @param {(v: TObjectValue) => TObjectValue} update
 * @returns TValue
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
 * @implements {IInMemoryView<any>}
 */
module.exports = class InMemoryView {

	/**
	 * Current view state as an object
	 *
	 * @deprecated Use `async getAll()` instead
	 *
	 * @type {Object}
	 * @readonly
	 */
	get state() {
		return strMapToObj(this._map);
	}

	/**
	 * Whether the view is restored
	 * @type {boolean}
	 */
	get ready() {
		return this._ready;
	}

	/**
	 * Whether the view is restored
	 *
	 * @type {boolean}
	 * @memberof InMemoryView
	 */
	set ready(value) {
		this._ready = value;
		if (this._ready)
			this._emitter.emit('ready');
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
		this._map = new Map();
		this._emitter = new EventEmitter();

		// explicitly bind functions to this object for easier using in Promises
		Object.defineProperties(this, {
			get: { value: this.get.bind(this) }
		});
	}

	/**
	 * Check if view contains a record with a given key.
	 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
	 *
	 * @deprecated Use `async get()` instead
	 *
	 * @param {string|number} key
	 * @returns {boolean}
	 * @memberof InMemoryView
	 */
	has(key) {
		return this._map.has(key);
	}

	/**
	 * Get record with a given key; await until the view is restored
	 *
	 * @param {string|number} key
	 * @param {object} [options]
	 * @param {boolean} [options.nowait] Skip waiting until the view is restored/ready
	 * @returns {Promise<any>}
	 * @memberof InMemoryView
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
	 * @param {(record: any, key?: any) => boolean} [filter]
	 */
	async getAll(filter) {
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when defined, must be a Function');

		if (!this._ready)
			await this.once('ready');

		const r = [];
		for (const entry of this._map.entries()) {
			if (filter && filter(entry[1], entry[0]))
				r.push(entry);
		}

		return r;
	}

	/**
	 * Create record with a given key and value
	 *
	 * @param {string|number} key
	 * @param {object} [value]
	 * @memberof InMemoryView
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
	 * @param {string|number} key
	 * @param {function(any):any} update
	 * @memberof InMemoryView
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
	 * @param {string|number} key
	 * @param {function(any):any} update
	 * @param {any} [initialValue]
	 * @memberof InMemoryView
	 */
	updateEnforcingNew(key, update, initialValue = {}) {
		if (!key) throw new TypeError('key argument required');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		if (!this._map.has(key))
			return this.create(key, applyUpdate(initialValue, update));

		return this._update(key, update);
	}

	/**
	 * Update all records that match filter criteria
	 *
	 * @param {function(any):boolean} [filter]
	 * @param {function(any):any} update
	 * @memberof InMemoryView
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
	 * @private
	 * @param {string|number} key
	 * @param {function(any):any} update
	 */
	_update(key, update) {
		const value = this._map.get(key);
		this._map.set(key, applyUpdate(value, update));
	}

	/**
	 * Delete record
	 *
	 * @param {string|number} key
	 * @memberof InMemoryView
	 */
	delete(key) {
		if (!key) throw new TypeError('key argument required');

		this._map.delete(key);
	}

	/**
	 * Delete all records that match filter criteria
	 *
	 * @param {function(any):boolean} [filter]
	 * @memberof InMemoryView
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
	 * @deprecated Use `ready = true`
	 * @memberof InMemoryView
	 */
	markAsReady() {
		this.ready = true;
	}

	/**
	 * Create a Promise which will resolve to a first emitted event of a given type
	 *
	 * @param {string} eventType
	 * @returns {Promise<any>}
	 */
	once(eventType) {
		if (typeof eventType !== 'string' || !eventType.length)
			throw new TypeError('eventType argument must be a non-empty String');

		return new Promise(rs => {
			this._emitter.once(eventType, rs);
		});
	}

	/**
	 * Get view summary as string
	 *
	 * @returns {string}
	 */
	toString() {
		return `${this.size} record${this.size !== 1 ? 's' : ''}, ${sizeOf(this._map)} bytes`;
	}
};
