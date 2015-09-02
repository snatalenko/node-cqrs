'use strict';

const validate = require('./validate');
const KEY_STATE = Symbol();

/**
 * Simple in-memory stored projection view
 */
class ProjectionView {

	get state() {
		return this[KEY_STATE];
	}

	get snapshot() {
		return JSON.parse(JSON.stringify(this.state));
	}

	constructor() {
		this[KEY_STATE] = {};

		// explicitly bind functions to this object for easier usage in Promises
		this.get = this.get.bind(this);
	}

	get(key) {
		if (!key) throw new TypeError('key argument required');
		// if (typeof required !== 'undefined' && typeof required !== 'boolean') throw new TypeError('required argument, when provided, must be a Boolean');
		// if (required && !(key in this.snapshot))
		// 	return Promise.reject(new Error('Record could not be found'));
		return Promise.resolve(this.snapshot[key]);
	}

	create(key, update) {
		validate.string(key, 'key');
		validate.argument(update, 'update');
		if (key in this.state) throw new Error('Key \'' + key + '\' already exists');

		if (typeof update === 'function') {
			update(this.state[key] = {});
		}
		else if (typeof update === 'object') {
			this.state[key] = update;
		}
		else {
			throw new TypeError('update argument must be either a function or an object');
		}
	}

	update(key, update) {
		validate.string(key, 'key');
		validate.func(update, 'update');
		if (!(key in this.state)) throw new Error('Key \'' + key + '\' does not exist');

		update(this.state[key]);
	}

	updateEnforcingNew(key, update) {
		validate.string(key, 'key');
		validate.argument(update, 'update');

		if (!(key in this.state)) {
			this.create(key, update);
		}
		else {
			this.update(key, update);
		}
	}

	updateAll(filter, update) {
		validate.func(filter, 'filter');
		validate.func(update, 'update');

		for (const key of Object.keys(this.state)) {
			update(this.state[key]);
		}
	}

	delete(key) {
		validate.string(key, 'key');
		delete this.state[key];
	}
}

module.exports = ProjectionView;
