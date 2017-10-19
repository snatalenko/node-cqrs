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
 * In-memory Projection View, which suspends get()'s until it is ready
 *
 * @class InMemoryView
 * @extends {EventEmitter}
 * @implements {IProjectionView}
 */
module.exports = class InMemoryView extends EventEmitter {

	/**
	 * Current view state as an object
	 * @deprecated
	 * @type {Object}
	 * @readonly
	 */
	get state() {
		return strMapToObj(this._map);
	}

	/**
	 * Whether the view is restored
	 *
	 * @readonly
	 * @type {boolean}
	 * @memberof InMemoryView
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
		super();

		this._map = new Map();
		this._ready = false;

		// explicitly bind functions to this object for easier using in Promises
		Object.defineProperties(this, {
			get: { value: this.get.bind(this) }
		});
	}

	/**
	 * Check if view contains a record with a given key.
	 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
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
	 * @returns {any}
	 * @memberof InMemoryView
	 */
	async get(key, options) {
		if (!key) throw new TypeError('key argument required');

		if (!this._ready && !(options && options.nowait))
			await this.once('ready');

		return this._map.get(key);
	}

	/**
	 * Create record with a given key and value
	 *
	 * @param {string|number} key
	 * @param {function(any):any|any} update Either initial value or an initial value factory
	 * @memberof InMemoryView
	 */
	create(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (!update) throw new TypeError('update argument required');

		if (this.has(key))
			throw new Error(`Key '${key}' already exists`);

		if (typeof update === 'function') {
			const initialValue = {};
			this._map.set(key, update(initialValue) || initialValue);
		}
		else {
			this._map.set(key, update);
		}
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

		if (!this.has(key))
			throw new Error(`Key '${key}' does not exist`);

		this._update(key, update);
	}

	/**
	 * Update existing view record or create new
	 *
	 * @param {string|number} key
	 * @param {function(any):any} update
	 * @memberof InMemoryView
	 */
	updateEnforcingNew(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		if (!this.has(key))
			return this.create(key, update);

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

		// OBSOLETE: if update function returns undefined, then it modifies passed in value;
		// logic left here for backward compatibility
		const updateResult = update(value);
		const newValue = updateResult !== undefined ? updateResult : value;

		this._map.set(key, newValue);
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
	 * @memberof InMemoryView
	 */
	markAsReady() {
		this._ready = true;
		this.emit('ready');
	}

	/**
	 * Create a Promise which will resolve to a first emitted event of a given type
	 *
	 * @param {string} eventType
	 * @returns {Promise<any>}
	 */
	once(eventType, cb) {
		if (typeof eventType !== 'string' || !eventType.length) throw new TypeError('eventType argument must be a non-empty String');
		if (typeof cb === 'function') throw new Error('once(..) method returns a Promise, no callback needed');

		return new Promise(rs => {
			super.once(eventType, rs);
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
