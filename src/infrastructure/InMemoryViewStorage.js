'use strict';

const _state = Symbol('state');

module.exports = class InMemoryViewStorage {

	get state() {
		return this[_state];
	}

	get snapshot() {
		return JSON.parse(JSON.stringify(this.state));
	}

	constructor() {
		this[_state] = {};

		// explicitly bind functions to this object for easier usage in Promises
		this.get = this.get.bind(this);
	}

	get(key) {
		if (!key) throw new TypeError('key argument required');

		const subview = this.state[key];

		return Promise.resolve(typeof subview === 'object' ? JSON.parse(JSON.stringify(subview)) : subview);
	}

	create(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (!update) throw new TypeError('update argument required');
		if (key in this.state) throw new Error(`Key '${key}' already exists`);

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
		if (!key) throw new TypeError('key argument required');
		if (!update) throw new TypeError('update argument required');
		if (!(key in this.state)) throw new Error(`Key '${key}' does not exist`);

		update(this.state[key]);
	}

	updateEnforcingNew(key, update) {
		if (!key) throw new TypeError('key argument required');
		if (!update) throw new TypeError('update argument required');

		if (!(key in this.state)) {
			this.create(key, update);
		}
		else {
			this.update(key, update);
		}
	}

	updateAll(filter, update) {
		if (typeof filter !== 'function') throw new TypeError('filter argument must be a Function');
		if (typeof update !== 'function') throw new TypeError('update argument must be a Function');

		for (const key of Object.keys(this.state)) {
			const view = this.state[key];
			if (filter(view)) {
				update(view);
			}
		}
	}

	delete(key) {
		if (!key) throw new TypeError('key argument required');
		delete this.state[key];
	}

	deleteAll(filter) {
		for (const key of Object.keys(this.state)) {
			const view = this.state[key];
			if (filter(view)) {
				delete this.state[key];
			}
		}
	}
};
