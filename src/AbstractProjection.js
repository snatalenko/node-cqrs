'use strict';

const Observer = require('./Observer');
const InMemoryViewStorage = require('./infrastructure/InMemoryViewStorage');
const { validateHandlers, sizeOf, getHandler } = require('./utils');
const _view = Symbol('view');

/**
 * Projection View
 * @typedef {{create, update, updateEnforcingNew, updateAll, delete, deleteAll, get, has}} IView
 */

/**
 * CQRS Event
 * @typedef {{ type: string }} IEvent
 */

module.exports = class AbstractProjection extends Observer {

	/**
	 * List of event types being handled by projection. Must be overridden in projection implementation
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		throw new Error('handles must be overridden to return a list of handled event types');
	}

	/**
	 * View associated with projection
	 *
	 * @type {IView}
	 * @readonly
	 */
	get view() {
		return this[_view];
	}

	/**
	 * Creates an instance of AbstractProjection
	 *
	 * @param {{ view: IView }} options
	 */
	constructor(options) {
		super();

		validateHandlers(this);

		Object.defineProperties(this, {
			[_view]: { value: (options && options.view) || new InMemoryViewStorage() }
		});
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {object} eventStore
	 */
	subscribe(eventStore) {
		Observer.subscribe(eventStore, this);
	}

	/**
	 * Restore projection view from event store
	 *
	 * @param {object} eventStore
	 * @return {Promise<IView>}
	 */
	restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		const messageTypes = Object.getPrototypeOf(this).constructor.handles;

		return eventStore.getAllEvents(messageTypes)
			.then(events => this.projectAll(events))
			.then(() => {
				this.info('projection view restored');
				if (this.view instanceof InMemoryViewStorage) {
					this.info(`${Object.keys(this.view.state).length} keys, ${sizeOf(this.view.state)} bytes`);
					this.view.markAsReady();
				}
			}, err => {
				this.info(`projection view restoring has failed: ${err}`);
				throw err;
			});
	}

	/**
	 * Project a set of events to projection view
	 *
	 * @param {IEvent[]} events
	 * @returns {Promise<*>}
	 */
	projectAll(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		return events.reduce((cur, event) =>
			cur.then(() => {
				const handler = getHandler(this, event.type);
				if (!handler)
					throw new Error(`'${event.type}' handler is not defined or not a function`);

				return handler.call(this, event);
			}),
			Promise.resolve());
	}
};
