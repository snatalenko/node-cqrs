'use strict';

const Observer = require('./Observer');
const InMemoryView = require('./infrastructure/InMemoryView');
const { getHandler } = require('./utils');

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
		this[_view] = (options && options.view) || new InMemoryView();
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {object} eventStore
	 */
	subscribe(eventStore) {
		super.subscribe(eventStore);
	}

	/**
	 * Restore projection view from event store
	 *
	 * @param {object} eventStore
	 * @return {Promise<IView>}
	 */
	async restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		const messageTypes = Object.getPrototypeOf(this).constructor.handles;

		const events = await eventStore.getAllEvents(messageTypes);

		for (const event of events) {
			try {
				const handler = getHandler(this, event.type);
				if (!handler)
					throw new Error(`'${event.type}' handler is not defined or not a function`);

				const r = handler.call(this, event);
				if (r instanceof Promise)
					await r;
			}
			catch (err) {
				this.info('projection view restoring has failed on event: %j', event);
				this.info(err);
				throw err;
			}
		}

		this.info('projection view restored, %d keys, %d bytes', this.view.size, this.view.bytes);

		if (typeof this.view.markAsReady === 'function')
			this.view.markAsReady();
	}
};
