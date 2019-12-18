'use strict';

const subscribe = require('./subscribe');
const InMemoryView = require('./infrastructure/InMemoryView');
const getHandledMessageTypes = require('./utils/getHandledMessageTypes');
const { validateHandlers, getHandler, getClassName } = require('./utils');
const info = require('debug')('cqrs:info');

/**
 * @param {IConcurrentView | any} view
 */
const isConcurrentView = view =>
	typeof view.lock === 'function' &&
	typeof view.unlock === 'function' &&
	typeof view.once === 'function';

/**
 * @template TRecord
 * @param {IProjectionView<TRecord>} view
 * @returns {IConcurrentView<TRecord>}
 */
// @ts-ignore
const asConcurrentView = view => (isConcurrentView(view) ? view : undefined);

/**
 * Base class for Projection definition
 *
 * @class AbstractProjection
 * @implements {IProjection}
 */
class AbstractProjection {

	/**
	 * List of event types being handled by projection. Can be overridden in projection implementation
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		return undefined;
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
	 * @type {boolean | Promise<boolean>}
	 * @readonly
	 */
	get shouldRestoreView() {
		return (this.view instanceof Map)
			|| (this.view instanceof InMemoryView);
	}

	/**
	 * Creates an instance of AbstractProjection
	 *
	 * @param {object} [options]
	 * @param {IProjectionView<any>} [options.view]
	 */
	constructor(options) {
		validateHandlers(this);

		if (options && options.view)
			this._view = options.view;
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {IEventStore} eventStore
	 * @return {Promise<void>}
	 */
	async subscribe(eventStore) {
		subscribe(eventStore, this, {
			masterHandler: this.project
		});

		await this.restore(eventStore);
	}

	/**
	 * Pass event to projection event handler
	 *
	 * @param {IEvent} event
	 */
	async project(event) {
		const concurrentView = asConcurrentView(this.view);
		if (concurrentView && !concurrentView.ready)
			await concurrentView.once('ready');

		return this._project(event);
	}

	/**
	 * Pass event to projection event handler, without awaiting for restore operation to complete
	 * @protected
	 * @param {IEvent} event
	 */
	async _project(event) {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		return handler.call(this, event);
	}

	/**
	 * Restore projection view from event store
	 *
	 * @param {IEventStore} eventStore
	 * @return {Promise<void>}
	 */
	async restore(eventStore) {
		// lock the view to ensure same restoring procedure
		// won't be performed by another projection instance
		const concurrentView = asConcurrentView(this.view);
		if (concurrentView)
			await concurrentView.lock();

		const shouldRestore = await this.shouldRestoreView;
		if (shouldRestore)
			await this._restore(eventStore);

		if (concurrentView)
			concurrentView.unlock();
	}

	/**
	 * Restore projection view from event store
	 * @protected
	 * @param {IEventStore} eventStore
	 * @return {Promise<void>}
	 */
	async _restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		info('retrieving events and restoring %s projection...', getClassName(this));

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getAllEvents(messageTypes);

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (err) {
				info('%s view restoring has failed on event: %j', getClassName(this), event);
				info(err);
				throw err;
			}
		}

		info('%s view restored (%s)', getClassName(this), this.view.toString());
	}
}

module.exports = AbstractProjection;
