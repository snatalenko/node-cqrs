'use strict';

const Observer = require('./Observer');
const InMemoryView = require('./infrastructure/InMemoryView');
const { validateHandlers, getHandler, getClassName } = require('./utils');
const info = require('debug')('cqrs:info');

const implementsIInMemoryView = view =>
	view instanceof InMemoryView
	|| (
		typeof view.ready === 'boolean' &&
		typeof view.once === 'function' &&
		typeof view.markAsReady === 'function'
	);

/**
 * @param {any} view
 * @returns {IInMemoryView?}
 */
const asInMemoryView = view => (implementsIInMemoryView(view) ? view : undefined);

/**
 * Base class for Projection definition
 *
 * @class AbstractProjection
 * @implements {IProjection}
 */
class AbstractProjection extends Observer {

	/**
	 * List of event types being handled by projection. Must be overridden in projection implementation
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		throw new Error('AbstractProjection.handles must be overridden to return a list of handled event types');
	}

	/**
	 * View associated with projection
	 *
	 * @type {IProjectionView<any>}
	 * @readonly
	 */
	get view() {
		return this._view || (this._view = new InMemoryView());
	}

	/**
	 * Indicates if view should be restored from EventStore on start.
	 * Override for custom behavior.
	 *
	 * @type {boolean}
	 * @readonly
	 */
	get shouldRestoreView() {
		return (this.view instanceof Map)
			|| implementsIInMemoryView(this.view);
	}

	/**
	 * Creates an instance of AbstractProjection
	 *
	 * @param {object} [options]
	 * @param {IProjectionView<any>} [options.view]
	 */
	constructor(options) {
		super();

		validateHandlers(this);

		if (options && options.view)
			this._view = options.view;
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {IEventStore} eventStore
	 */
	subscribe(eventStore) {
		super.subscribe(eventStore, undefined, this.project);

		if (this.shouldRestoreView)
			this.restore(eventStore);
	}

	/**
	 * Pass event to projection event handler
	 *
	 * @param {IEvent} event
	 * @param {object} [options]
	 * @param {boolean} [options.nowait]
	 */
	async project(event, options) {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		const inMemoryView = asInMemoryView(this.view);
		if (inMemoryView && inMemoryView.ready === false && !(options && options.nowait))
			await inMemoryView.once('ready');

		return handler.call(this, event);
	}

	/**
	 * Restore projection view from event store
	 * @private
	 * @param {IEventStore} eventStore
	 * @return {Promise<void>}
	 */
	async restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		const messageTypes = Object.getPrototypeOf(this).constructor.handles;

		const events = await eventStore.getAllEvents(messageTypes);

		for (const event of events) {
			try {
				await this.project(event, { nowait: true });
			}
			catch (err) {
				info('%s view restoring has failed on event: %j', this, event);
				info(err);
				throw err;
			}
		}

		info('%s view restored (%s)', this, this.view);

		const inMemoryView = asInMemoryView(this.view);
		if (inMemoryView)
			inMemoryView.markAsReady();
	}

	/**
	 * Get human-readable Projection name
	 */
	toString() {
		return getClassName(this);
	}
}

module.exports = AbstractProjection;
