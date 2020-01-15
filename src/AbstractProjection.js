'use strict';

const subscribe = require('./subscribe');
const InMemoryView = require('./infrastructure/InMemoryView');
const getHandledMessageTypes = require('./utils/getHandledMessageTypes');
const { validateHandlers, getHandler, getClassName } = require('./utils');
const nullLogger = require('./utils/nullLogger');

/**
 * @param {any} view
 */
const isConcurrentView = view =>
	typeof view.lock === 'function' &&
	typeof view.unlock === 'function' &&
	typeof view.once === 'function';

/**
 * @param {any} view
 * @returns {IConcurrentView}
 */
const asConcurrentView = view => (isConcurrentView(view) ? view : undefined);

/**
 * Base class for Projection definition
 *
 * @class AbstractProjection
 * @implements {IProjection}
 */
class AbstractProjection {

	/**
	 * Optional list of event types being handled by projection.
	 * Can be overridden in projection implementation.
	 * If not overridden, will detect event types from event handlers declared on the Projection class
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		return undefined;
	}

	/**
	 * Default view associated with projection.
	 * If not defined, an instance of `NodeCqrs.InMemoryView` is created on first access.
	 *
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
	 * @param {any} [options.view]
	 * @param {ILogger} [options.logger]
	 */
	constructor(options) {
		validateHandlers(this);

		if (options && options.view)
			this._view = options.view;

		this._logger = (options && options.logger) || nullLogger;
	}

	/**
	 * Subscribe to event store
	 *
	 * @param {IEventStore} eventStore
	 * @return {Promise<void>}
	 */
	async subscribe(eventStore) {
		subscribe(eventStore, this, {
			masterHandler: e => this.project(e)
		});

		await this.restore(eventStore);
	}

	/**
	 * Pass event to projection event handler
	 *
	 * @param {IEvent} event
	 * @returns {Promise<void>}
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
		/* istanbul ignore if */
		if (!eventStore) throw new TypeError('eventStore argument required');
		/* istanbul ignore if */
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		const service = getClassName(this);
		this._logger.log('debug', 'retrieving events and restoring projection...', { service });

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getAllEvents(messageTypes);

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (err) {
				this._onRestoringError(err, event);
			}
		}

		this._logger.log('info', `view restored (${this.view})`, { service });
	}

	/**
	 * Handle error on restoring
	 *
	 * @protected
	 * @param {Error} error
	 * @param {IEvent} event
	 */
	_onRestoringError(error, event) {
		this._logger.log('error', `view restoring has failed: ${error.message}`, {
			service: getClassName(this),
			event,
			stack: error.stack
		});
		throw error;
	}
}

module.exports = AbstractProjection;
