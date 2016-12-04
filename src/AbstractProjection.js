'use strict';

const Observer = require('./Observer');
const InMemoryViewStorage = require('./infrastructure/InMemoryViewStorage');
const { validateHandlers, passToHandlerAsync, sizeOf } = require('./utils');
const _view = Symbol('view');

module.exports = class AbstractProjection extends Observer {

	static get handles() {
		throw new Error('handles must be overridden to return a list of handled event types');
	}

	get view() {
		return this[_view];
	}

	set view(view) {
		if (typeof view.create !== 'function') throw new TypeError('view.create argument must be a Function');
		if (typeof view.update !== 'function') throw new TypeError('view.update argument must be a Function');
		if (typeof view.updateEnforcingNew !== 'function') throw new TypeError('view.updateEnforcingNew argument must be a Function');
		if (typeof view.updateAll !== 'function') throw new TypeError('view.updateAll argument must be a Function');
		if (typeof view.delete !== 'function') throw new TypeError('view.delete argument must be a Function');
		if (typeof view.deleteAll !== 'function') throw new TypeError('view.deleteAll argument must be a Function');
		this[_view] = view;
	}

	constructor(options) {
		super();

		this.view = (options && options.view) || new InMemoryViewStorage();

		this._handles = validateHandlers(this);
	}

	subscribe(eventStore) {
		super.subscribe(eventStore, this._handles, this.project);
	}

	/**
	 * Restore projection view from eventStore
	 * @param  {Object} 	EventStore instance
	 * @return {Promise} 	resolving to a restored projection view
	 */
	restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		return eventStore.getAllEvents(this._handles)
			.then(events => this.projectAll(events))
			.then(() => {
				this.info('projection view restored: %d keys, %d bytes', Object.keys(this.view.state).length, sizeOf(this.view.state));
			}, err => {
				this.info(`projection view restoring has failed: ${err}`);
				throw err;
			});
	}

	/**
	 * Project an event to projection view
	 * @param  {Object} event to project
	 */
	project(event) {
		if (!event) throw new TypeError('event argument required');

		this.debug(`projecting ${event.type} (${event.aggregateId})...`);

		return passToHandlerAsync(this, event.type, event);
	}

	projectAll(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		return events.reduce((cur, event) =>
			cur.then(() => this.project(event)),
			Promise.resolve());
	}

	createView(key, update) {
		return this.view.create(key, update);
	}

	updateView(key, update) {
		return this.view.update(key, update);
	}

	updateViewEnforcingNew(key, update) {
		return this.view.updateEnforcingNew(key, update);
	}

	updateAll(filter, update) {
		return this.view.updateAll(filter, update);
	}

	deleteView(key) {
		return this.view.delete(key);
	}

	deleteAll(filter) {
		return this.view.deleteAll(filter);
	}
};
