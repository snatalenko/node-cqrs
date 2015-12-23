'use strict';

const validate = require('../validate');
const KEY_STATE = Symbol();

module.exports = class InMemoryProjectionView {

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
		validate.identifier(key, 'key');

		const subview = this.state[key];
		if (typeof subview === 'object')
			return Promise.resolve(JSON.parse(JSON.stringify(subview)));
		else
			return Promise.resolve(subview);
	}

	create(key, update) {
		validate.identifier(key, 'key');
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
		validate.identifier(key, 'key');
		validate.func(update, 'update');
		if (!(key in this.state)) throw new Error('Key \'' + key + '\' does not exist');

		update(this.state[key]);
	}

	updateEnforcingNew(key, update) {
		validate.identifier(key, 'key');
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
			const view = this.state[key];
			if (filter(view)) {
				update(view);
			}
		}
	}

	delete(key) {
		validate.identifier(key, 'key');
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
