'use strict';

const nullLogger = require('./utils/nullLogger');
const setupOneTimeEmitterSubscription = require('./utils/setupOneTimeEmitterSubscription');

/**
 * @param {IEventStream} events
 * @returns {string}
 */
const formatEventType = events => (events.length === 1 ? `'${events[0].type}'` : `${events.length} events`);

/**
 * @param {IEventStorage} storage
 */
const isIEventStorage = storage => storage
	&& typeof storage.getNewId === 'function'
	&& typeof storage.commit === 'function'
	&& typeof storage.getStream === 'function'
	&& typeof storage.getEventsByTypes === 'function';

/**
 * @param {IObservable | any} obj
 */
const isIObservable = obj => obj
	&& typeof obj.on === 'function'
	&& typeof obj.off === 'function';

/**
 * @param {IMessageBus} bus
 * @returns {boolean}
 */
const isIMessageBus = bus => bus
	&& isIObservable(bus)
	&& typeof bus.send === 'function'
	&& typeof bus.publish === 'function';

/**
 * Validate event structure
 *
 * @param {IEvent} event
 * @throws {TypeError}
 */
function defaultValidator(event) {
	/* istanbul ignore if */
	if (typeof event !== 'object' || !event)
		throw new TypeError('event must be an Object');
	/* istanbul ignore if */
	if (typeof event.type !== 'string' || !event.type.length)
		throw new TypeError('event.type must be a non-empty String');
	/* istanbul ignore if */
	if (!event.aggregateId && !event.sagaId)
		throw new TypeError('either event.aggregateId or event.sagaId is required');
	/* istanbul ignore if */
	if (event.sagaId && typeof event.sagaVersion === 'undefined')
		throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
}

/**
 * @typedef {object} EventStoreConfig
 * @property {boolean} [publishAsync]
 */

/**
 * Facade that combines functionality of IEventStorage and IObservable into single IEventStore interface.
 *
 * If storage instance implements the IObservable interface, it can be used directly without this facade.
 *
 * @class EventStore
 * @implements {IEventStorage}
 * @implements {IObservable}
 */
class EventStore {

	/**
	 * Creates an instance of EventStore.
	 *
	 * @param {object} options
	 * @param {IEventStorage} options.storage
	 * @param {IMessageBus} options.messageBus
	 * @param {IMessageHandler} [options.eventValidator]
	 * @param {object} [options.eventStoreConfig]
	 * @param {boolean} [options.eventStoreConfig.publishAsync]
	 * @param {ILogger} [options.logger]
	 */
	constructor({ storage, messageBus, eventValidator = defaultValidator, eventStoreConfig, logger = nullLogger }) {
		if (!isIEventStorage(storage))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (isIObservable(storage))
			throw new TypeError('storage already implements IObservable interface and can be used without EventStore wrapper');
		if (!isIMessageBus(messageBus))
			throw new TypeError('messageBus does not implement IMessageBus interface');

		this._config = { publishAsync: true, ...eventStoreConfig };
		this._validator = eventValidator;
		this._logger = logger;
		this._storage = storage;
		this._messageBus = messageBus;
	}

	/**
	 * Retrieve new ID from the storage
	 *
	 * @returns {Promise<Identifier>}
	 */
	async getNewId() {
		return this._storage.getNewId();
	}

	/**
	 * Save and publish a set of events
	 *
	 * @param {Identifier} streamId
	 * @param {IEventStream} events
	 * @returns {Promise<IEventStream>}
	 */
	async commit(streamId, events) {
		events.forEach(this._validator);

		const newEvents = await this._storage.commit(streamId, events);

		if (this._config.publishAsync)
			setImmediate(() => this._publishEvents(newEvents));
		else
			await this._publishEvents(newEvents);

		return newEvents;
	}

	/**
	 * @private
	 * @param {IEventStream} events
	 */
	async _publishEvents(events) {
		try {
			await Promise.all(events.map(event =>
				this._messageBus.publish(event)));

			this._log(`${formatEventType(events)} published`);
		}
		catch (error) {
			this._logger.log('error', `${formatEventType(events)} publishing failed: ${error.message}`, { service: 'EventStore', stack: error.stack });

			throw error;
		}
	}

	/**
	 * Get a stream of events by identifier
	 *
	 * @param {Identifier} streamId
	 * @param {IEventQueryFilter} [filter]
	 * @returns {AsyncIterableIterator<IEvent>}
	 */
	getStream(streamId, filter) {
		this._log(`Retrieving stream ${streamId}`);
		return this._storage.getStream(streamId, filter);
	}

	/**
	 * Get events by their types
	 *
	 * @param {string[]} eventTypes
	 * @param {IEventQueryFilter} filter
	 * @returns {AsyncIterableIterator<IEvent>}
	 */
	getEventsByTypes(eventTypes, filter) {
		this._log(`Retrieving events ${eventTypes.join(', ')}`);
		return this._storage.getEventsByTypes(eventTypes, filter);
	}

	/**
	 * Setup listener for specific event type
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 */
	on(messageType, handler) {
		this._messageBus.on(messageType, handler);
	}

	/**
	 * Remove previously installed listener
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 */
	off(messageType, handler) {
		this._messageBus.off(messageType, handler);
	}

	/**
	 * Get or create a named queue, which delivers events to a single handler only
	 *
	 * @param {string} name
	 * @returns {IObservable}
	 */
	queue(name) {
		if (typeof this._messageBus.queue !== 'function')
			throw new Error('Named queues are not supported by the underlying messageBus');

		return this._messageBus.queue(name);
	}

	/**
	 * Creates one-time subscription for one or multiple events that match a filter
	 *
	 * @param {string|string[]} messageTypes - Array of event type to subscribe to
	 * @param {IMessageHandler} [handler] - Optional handler to execute for a first event received
	 * @param {function(IEvent):boolean} [filter] - Optional filter to apply before executing a handler
	 * @return {Promise<IEvent>} Resolves to first event that passes filter
	 */
	once(messageTypes, handler, filter) {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this._messageBus, subscribeTo, filter, handler, this._logger);
	}

	/**
	 * @private
	 * @param {string} message
	 */
	_log(message) {
		this._logger.log('debug', message, { service: 'EventStore' });
	}
}

module.exports = EventStore;
