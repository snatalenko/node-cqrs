'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:debug:EventStore');
const info = require('debug')('cqrs:info:EventStore');
const EventStream = require('./EventStream');

const SNAPSHOT_EVENT_TYPE = 'snapshot';

const _defaults = {
	publishAsync: true
};

/**
 * Validate event structure
 *
 * @param {IEvent} event
 */
function validateEvent(event) {
	if (typeof event !== 'object' || !event) throw new TypeError('event must be an Object');
	if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type must be a non-empty String');
	if (!event.aggregateId && !event.sagaId) throw new TypeError('either event.aggregateId or event.sagaId is required');
	if (event.sagaId && typeof event.sagaVersion === 'undefined') throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
}

/**
 * Ensure provided eventStorage matches the expected format
 * @param {IEventStorage} storage
 */
function validateEventStorage(storage) {
	if (!storage) throw new TypeError('storage argument required');
	if (typeof storage !== 'object') throw new TypeError('storage argument must be an Object');
	if (typeof storage.commitEvents !== 'function') throw new TypeError('storage.commitEvents must be a Function');
	if (typeof storage.getEvents !== 'function') throw new TypeError('storage.getEvents must be a Function');
	if (typeof storage.getAggregateEvents !== 'function') throw new TypeError('storage.getAggregateEvents must be a Function');
	if (typeof storage.getSagaEvents !== 'function') throw new TypeError('storage.getSagaEvents must be a Function');
	if (typeof storage.getNewId !== 'function') throw new TypeError('storage.getNewId must be a Function');
}

/**
 * Check if storage emits events
 *
 * @param {object} storage
 * @returns {boolean}
 */
function isEmitter(storage) {
	return typeof storage.on === 'function';
}

/**
 * Ensure snapshotStorage matches the expected format
 * @param {IAggregateSnapshotStorage} snapshotStorage
 */
function validateSnapshotStorage(snapshotStorage) {
	if (typeof snapshotStorage !== 'object' || !snapshotStorage)
		throw new TypeError('snapshotStorage argument must be an Object');
	if (typeof snapshotStorage.getAggregateSnapshot !== 'function')
		throw new TypeError('snapshotStorage.getAggregateSnapshot argument must be a Function');
	if (typeof snapshotStorage.saveAggregateSnapshot !== 'function')
		throw new TypeError('snapshotStorage.saveAggregateSnapshot argument must be a Function');
}

/**
 * Ensure messageBus matches the expected format
 * @param {IMessageBus} messageBus
 */
function validateMessageBus(messageBus) {
	if (typeof messageBus !== 'object' || !messageBus)
		throw new TypeError('messageBus argument must be an Object');
	if (typeof messageBus.on !== 'function')
		throw new TypeError('messageBus.on argument must be a Function');
	if (typeof messageBus.publish !== 'function')
		throw new TypeError('messageBus.publish argument must be a Function');
}

/**
 * Create one-time eventEmitter subscription for one or multiple events that match a filter
 *
 * @param {IEventEmitter} emitter
 * @param {string[]} messageTypes Array of event type to subscribe to
 * @param {function(IEvent):any} [handler] Optional handler to execute for a first event received
 * @param {function(IEvent):boolean} [filter] Optional filter to apply before executing a handler
 * @return {Promise<IEvent>} Resolves to first event that passes filter
 */
function setupOneTimeEmitterSubscription(emitter, messageTypes, filter, handler) {
	if (typeof emitter !== 'object' || !emitter)
		throw new TypeError('emitter argument must be an Object');
	if (!Array.isArray(messageTypes) || messageTypes.some(m => !m || typeof m !== 'string'))
		throw new TypeError('messageTypes argument must be an Array of non-empty Strings');
	if (handler && typeof handler !== 'function')
		throw new TypeError('handler argument, when specified, must be a Function');
	if (filter && typeof filter !== 'function')
		throw new TypeError('filter argument, when specified, must be a Function');

	return new Promise(resolve => {

		// handler will be invoked only once,
		// even if multiple events have been emitted before subscription was destroyed
		// https://nodejs.org/api/events.html#events_emitter_removelistener_eventname_listener
		let handled = false;

		function filteredHandler(event) {
			if (filter && !filter(event)) return;
			if (handled) return;
			handled = true;

			for (const messageType of messageTypes)
				emitter.off(messageType, filteredHandler);

			debug('\'%s\' received, one-time subscription to \'%s\' removed', event.type, messageTypes.join(','));

			if (handler)
				handler(event);

			resolve(event);
		}

		for (const messageType of messageTypes)
			emitter.on(messageType, filteredHandler);

		debug('set up one-time %s to \'%s\'', filter ? 'filtered subscription' : 'subscription', messageTypes.join(','));
	});
}

/**
 * @typedef {object} EventStoreConfig
 * @property {boolean} [publishAsync]
 */

/**
 * @class EventStore
 * @implements {IEventStore}
 */
class EventStore {

	/**
	 * Default configuration
	 *
	 * @type {EventStoreConfig}
	 * @static
	 */
	static get defaults() {
		return _defaults;
	}

	/**
	 * Configuration
	 *
	 * @type {EventStoreConfig}
	 * @readonly
	 */
	get config() {
		return this._config;
	}

	/**
	 * Whether storage supports aggregate snapshots
	 *
	 * @type {boolean}
	 * @readonly
	 */
	get snapshotsSupported() {
		return Boolean(this._snapshotStorage);
	}

	/**
	 * Creates an instance of EventStore.
	 *
	 * @param {object} options
	 * @param {IEventStorage} options.storage
	 * @param {IAggregateSnapshotStorage} [options.snapshotStorage]
	 * @param {IMessageBus} [options.messageBus]
	 * @param {function(IEvent):void} [options.eventValidator]
	 * @param {EventStoreConfig} [options.eventStoreConfig]
	 */
	constructor(options) {
		validateEventStorage(options.storage);
		if (options.snapshotStorage)
			validateSnapshotStorage(options.snapshotStorage);
		if (options.messageBus)
			validateMessageBus(options.messageBus);
		if (options.eventValidator !== undefined && typeof options.eventValidator !== 'function')
			throw new TypeError('eventValidator, when provided, must be a function');

		this._config = Object.freeze(Object.assign({}, EventStore.defaults, options.eventStoreConfig));
		this._storage = options.storage;
		this._snapshotStorage = options.snapshotStorage;
		this._validator = options.eventValidator || validateEvent;

		if (options.messageBus) {
			this._publishTo = options.messageBus;
			this._eventEmitter = options.messageBus;
		}
		else if (isEmitter(options.storage)) {
			/** @type {IEventEmitter} */
			this._eventEmitter = options.storage;
		}
		else {
			const internalMessageBus = new InMemoryBus();
			this._publishTo = internalMessageBus;
			this._eventEmitter = internalMessageBus;
		}
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
	 * Retrieve all events of specific types
	 *
	 * @param {string[]} eventTypes
	 * @param {EventFilter} [filter]
	 * @returns {Promise<IEventStream>}
	 */
	async getAllEvents(eventTypes, filter) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		debug('retrieving %s events...', eventTypes ? eventTypes.join(', ') : 'all');

		const events = await this._storage.getEvents(eventTypes, filter);

		const eventStream = new EventStream(events);
		debug('%s retrieved', eventStream);

		return eventStream;
	}

	/**
	 * Retrieve all events of specific Aggregate
	 *
	 * @param {string|number} aggregateId
	 * @returns {Promise<IEventStream>}
	 */
	async getAggregateEvents(aggregateId) {
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const snapshot = this.snapshotsSupported ?
			await this._snapshotStorage.getAggregateSnapshot(aggregateId) :
			undefined;

		const events = await this._storage.getAggregateEvents(aggregateId, { snapshot });

		const eventStream = new EventStream(snapshot ? [snapshot, ...events] : events);
		debug('%s retrieved', eventStream);

		return eventStream;
	}

	/**
	 * Retrieve events of specific Saga
	 *
	 * @param {string|number} sagaId
	 * @param {EventFilter} filter
	 * @returns {Promise<IEventStream>}
	 */
	async getSagaEvents(sagaId, filter) {
		if (!sagaId) throw new TypeError('sagaId argument required');
		if (!filter) throw new TypeError('filter argument required');
		if (!filter.beforeEvent) throw new TypeError('filter.beforeEvent argument required');
		if (filter.beforeEvent.sagaVersion === undefined) throw new TypeError('filter.beforeEvent.sagaVersion argument required');

		debug(`retrieving event stream for saga ${sagaId}, v${filter.beforeEvent.sagaVersion}...`);

		const events = await this._storage.getSagaEvents(sagaId, filter);

		const eventStream = new EventStream(events);
		debug('%s retrieved', eventStream);

		return eventStream;
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param {IEvent[]} events - a set of events to commit
	 * @returns {Promise<IEventStream>} - resolves to signed and committed events
	 */
	async commit(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		const eventStream = await this.save(events);

		// after events are saved to the persistent storage,
		// publish them to the event bus (i.e. RabbitMq)
		if (this._publishTo)
			await this.publish(eventStream);

		return eventStream;
	}

	/**
	 * Save events to the persistent storage
	 *
	 * @param {IEvent[]} events
	 * @returns {Promise<IEventStream>}
	 */
	async save(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		const snapshotEvents = events.filter(e => e.type === SNAPSHOT_EVENT_TYPE);
		if (snapshotEvents.length > 1)
			throw new Error(`cannot commit a stream with more than 1 ${SNAPSHOT_EVENT_TYPE} event`);
		if (snapshotEvents.length && !this.snapshotsSupported)
			throw new Error(`${SNAPSHOT_EVENT_TYPE} event type is not supported by the storage`);

		const snapshot = snapshotEvents[0];
		const eventStream = new EventStream(events.filter(e => e !== snapshot));

		debug('validating %s...', eventStream);
		eventStream.forEach(this._validator);

		debug('saving %s...', eventStream);
		await Promise.all([
			this._storage.commitEvents(eventStream),
			snapshot ?
				this._snapshotStorage.saveAggregateSnapshot(snapshot) :
				undefined
		]);

		return eventStream;
	}

	/**
	 * After events are
	 * @param {IEventStream} eventStream
	 */
	async publish(eventStream) {
		const publishEvents = () =>
			Promise.all(eventStream.map(event => this._publishTo.publish(event)))
				.then(() => {
					debug('%s published', eventStream);
				}, err => {
					info('%s publishing failed: %s', eventStream, err);
					throw err;
				});

		if (this.config.publishAsync) {
			debug('publishing %s asynchronously...', eventStream);
			setImmediate(publishEvents);
		}
		else {
			debug('publishing %s synchronously...', eventStream);
			await publishEvents();
		}
	}

	/**
	 * Setup a listener for a specific event type
	 *
	 * @param {string} messageType
	 * @param {function(IEvent): any} handler
	 * @param {object} [options]
	 * @param {string} [options.queueName] Name of the queue in environment with multiple event handlers installed
	 */
	on(messageType, handler, options) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		this._eventEmitter.on(messageType, handler, options);
	}

	/**
	 * Creates one-time subscription for one or multiple events that match a filter
	 *
	 * @param {string|string[]} messageTypes - Array of event type to subscribe to
	 * @param {function(IEvent):any} [handler] - Optional handler to execute for a first event received
	 * @param {function(IEvent):boolean} [filter] - Optional filter to apply before executing a handler
	 * @return {Promise<IEvent>} Resolves to first event that passes filter
	 */
	once(messageTypes, handler, filter) {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this._eventEmitter, subscribeTo, filter, handler);
	}
}

module.exports = EventStore;
