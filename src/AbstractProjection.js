'use strict';

const Observer = require('./Observer');
const InMemoryView = require('./infrastructure/InMemoryView');
const { validateHandlers, getHandler } = require('./utils');

const _view = Symbol('view');

/**
 * Base class for Projection definition
 *
 * @class AbstractProjection
 * @extends {Observer}
 * @implements {IProjection}
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
	 * @type {IProjectionView}
	 * @readonly
	 */
	get view() {
		return this[_view];
	}

	/**
	 * Creates an instance of AbstractProjection
	 *
	 * @param {object} [options]
	 * @param {IProjectionView} [options.view]
	 */
	constructor(options) {
		super();
		validateHandlers(this);
		this[_view] = (options && options.view) || new InMemoryView();
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {IEventStore} eventStore
	 */
	subscribe(eventStore) {
		super.subscribe(eventStore, undefined, this.project);

		if (this.view.ready === false)
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

		if (this.view.ready === false && !(options && options.nowait))
			await this.view.once('ready');

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
				this.info('projection view restoring has failed on event: %j', event);
				this.info(err);
				throw err;
			}
		}

		this.info('projection view restored (%s)', this.view);

		if (typeof this.view.markAsReady === 'function')
			this.view.markAsReady();
	}
};
