'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:debug:EventStore');
const info = require('debug')('cqrs:info:EventStore');
const EventStream = require('./EventStream');

const SNAPSHOT_EVENT_TYPE = 'snapshot';

const _storage = Symbol('storage');
const _eventBus = Symbol('eventBus');
const _publishEventsAfterCommit = Symbol('publishEventsLocally');
const _validator = Symbol('validator');
const _config = Symbol('config');
const _namedQueues = Symbol('queueHandlers');
const _defaults = {
	hostname: undefined,
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
 * Attaches command and node fields to each event in a given array
 *
 * @param {IEvent[]} events
 * @param {{ context, sagaId, sagaVersion }} sourceCommand
 * @param {{ hostname }} eventStoreConfig
 * @returns {EventStream}
 */
function augmentEvents(events, sourceCommand = {}, eventStoreConfig) {
	if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

	const { sagaId, sagaVersion, context } = sourceCommand;
	const { hostname } = eventStoreConfig;

	const extension = {
		sagaId,
		sagaVersion,
		context: hostname ?
			Object.assign({ hostname }, context) :
			context
	};

	return EventStream.from(events, event => Object.assign({}, extension, event));
}

/**
 * CQRS Event
 * @typedef {{ type:string, aggregateId?:string, aggregateVersion?:number, sagaId?:string, sagaVersion?:number }} IEvent
 * @property {string} type
 * @property {string|number} [aggregateId]
 * @property {number} [aggregateVersion]
 * @property {string|number} [sagaId]
 * @property {number} [sagaVersion]
 */

/**
 * Event Filter
 * @typedef {{ afterEvent?: IEvent, beforeEvent?: IEvent }} IEventFilter
 * @property {IEvent} [afterEvent]
 * @property {IEvent} [beforeEvent]
 */

module.exports = class EventStore {

	/**
	 * Default configuration
	 *
	 * @type {{ hostname: string, publishAsync: boolean }}
	 * @static
	 */
	static get defaults() {
		return _defaults;
	}

	/**
	 * Configuration
	 *
	 * @type {{ hostname: string, publishAsync: boolean }}
	 * @readonly
	 */
	get config() {
		return this[_config];
	}

	/**
	 * Whether storage supports aggregate snapshots
	 *
	 * @type {boolean}
	 * @readonly
	 */
	get snapshotsSupported() {
		return 'getAggregateSnapshot' in this[_storage]
			&& 'saveAggregateSnapshot' in this[_storage];
	}

	/**
	 * Whether event bus supports named queues
	 *
	 * @type {boolean}
	 * @readonly
	 */
	get distributedNamedQueuesSupported() {
		const EventBusType = Object.getPrototypeOf(this[_eventBus]).constructor;
		return EventBusType && !!EventBusType.supportsQueues;
	}

	/**
	 * Creates an instance of EventStore.
	 *
	 * @param {{ storage, messageBus, eventValidator, eventStoreConfig }} options
	 */
	constructor({ storage, messageBus, eventValidator, eventStoreConfig }) {
		if (!storage) throw new TypeError('storage argument required');
		if (typeof storage.commitEvents !== 'function') throw new TypeError('storage.commitEvents must be a Function');
		if (typeof storage.getEvents !== 'function') throw new TypeError('storage.getEvents must be a Function');
		if (typeof storage.getAggregateEvents !== 'function') throw new TypeError('storage.getAggregateEvents must be a Function');
		if (typeof storage.getSagaEvents !== 'function') throw new TypeError('storage.getSagaEvents must be a Function');
		if (typeof storage.getNewId !== 'function') throw new TypeError('storage.getNewId must be a Function');
		if (messageBus !== undefined && typeof messageBus.on !== 'function')
			throw new TypeError('messageBus must implement method on(eventType, listener)');
		if (eventValidator !== undefined && typeof eventValidator !== 'function')
			throw new TypeError('eventValidator, when provided, must be a function');

		this[_config] = Object.freeze(Object.assign({}, EventStore.defaults, eventStoreConfig));
		this[_storage] = storage;
		this[_validator] = eventValidator || validateEvent;
		this[_namedQueues] = new Map();

		if (messageBus) {
			this[_publishEventsAfterCommit] = true;
			this[_eventBus] = messageBus;
		}
		else if (typeof storage.on === 'function') {
			this[_publishEventsAfterCommit] = false;
			this[_eventBus] = storage;
		}
		else {
			this[_publishEventsAfterCommit] = true;
			this[_eventBus] = new InMemoryBus();
		}
	}

	/**
	 * Retrieve new ID from the storage
	 *
	 * @returns {Promise<string>}
	 */
	async getNewId() {
		return this[_storage].getNewId();
	}

	/**
	 * Retrieve all events of specific types
	 *
	 * @param {string[]} eventTypes
	 * @param {IEventFilter} [filter]
	 * @returns {Promise<EventStream>}
	 */
	async getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		debug(`retrieving ${eventTypes ? eventTypes.join(', ') : 'all'} events...`);

		const events = await this[_storage].getEvents(eventTypes);

		const eventStream = EventStream.from(events);
		debug(`${eventStream} retrieved`);

		return eventStream;
	}

	/**
	 * Retrieve all events of specific Aggregate
	 *
	 * @param {string|number} aggregateId
	 * @returns {Promise<EventStream>}
	 */
	async getAggregateEvents(aggregateId) {
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const snapshot = this.snapshotsSupported ?
			await this[_storage].getAggregateSnapshot(aggregateId) :
			undefined;

		const events = await this[_storage].getAggregateEvents(aggregateId, { snapshot });

		const eventStream = EventStream.from(snapshot ? [snapshot, ...events] : events);
		debug(`${eventStream} retrieved`);

		return eventStream;
	}

	/**
	 * Retrieve events of specific Saga
	 *
	 * @param {string|number} sagaId
	 * @param {IEventFilter} filter
	 * @returns {Promise<EventStream>}
	 */
	async getSagaEvents(sagaId, filter) {
		if (!sagaId) throw new TypeError('sagaId argument required');
		if (!filter) throw new TypeError('filter argument required');
		if (!filter.beforeEvent) throw new TypeError('filter.beforeEvent argument required');
		if (filter.beforeEvent.sagaVersion === undefined) throw new TypeError('filter.beforeEvent.sagaVersion argument required');

		debug(`retrieving event stream for saga ${sagaId}, v${filter.beforeEvent.sagaVersion}...`);

		const events = await this[_storage].getSagaEvents(sagaId, filter);

		const eventStream = EventStream.from(events);
		debug(`${eventStream} retrieved`);

		return eventStream;
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param {IEvent[]} events - a set of events to commit
	 * @returns {Promise<IEvent[]>} - resolves to signed and committed events
	 */
	async commit(events, { sourceCommand } = {}) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');
		if (!events.length) return events;

		const snapshotEvents = events.filter(e => e.type === SNAPSHOT_EVENT_TYPE);
		if (snapshotEvents.length > 1)
			throw new Error(`cannot commit a stream with more than 1 ${SNAPSHOT_EVENT_TYPE} event`);
		if (snapshotEvents.length && !this.snapshotsSupported)
			throw new Error(`${SNAPSHOT_EVENT_TYPE} event type is not supported by the storage`);

		const snapshot = snapshotEvents[0];
		if (snapshot)
			events = events.filter(e => e !== snapshot);

		const { hostname } = this.config;
		const eventStream = augmentEvents(events, sourceCommand, { hostname });

		debug(`validating ${eventStream}...`);
		eventStream.forEach(this[_validator]);

		debug(`committing ${eventStream}...`);
		await Promise.all([
			this[_storage].commitEvents(eventStream),
			snapshot ?
				this[_storage].saveAggregateSnapshot(snapshot) :
				undefined
		]);

		if (this[_publishEventsAfterCommit]) {
			const publishEvents = () =>
				Promise.all(eventStream.map(event => this[_eventBus].publish(event)))
					.then(() => {
						info(`${eventStream} published`);
					}, err => {
						info(`${eventStream} publishing failed: ${err}`);
						throw err;
					});

			if (this.config.publishAsync) {
				debug(`publishing ${eventStream} asynchronously...`);
				setImmediate(publishEvents);
			}
			else {
				debug(`publishing ${eventStream} synchronously...`);
				await publishEvents();
			}
		}

		return eventStream;
	}

	/**
	 * Setup a listener for a specific event type
	 *
	 * @param {string} messageType
	 * @param {function(IEvent): any} handler
	 */
	on(messageType, handler, { queueName } = {}) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		if (queueName && !this.distributedNamedQueuesSupported)
			return this._setupLocalNamedSubscription(messageType, handler, queueName);

		return this[_eventBus].on(messageType, handler, { queueName });
	}

	/**
	 * Set up subscription that reacts to local events only
	 *
	 * @private
	 * @param {string} messageType
	 * @param {function(IEvent): any} handler
	 * @param {string} queueName
	 */
	_setupLocalNamedSubscription(messageType, handler, queueName) {
		if (!this.config.hostname)
			throw new Error(`'${messageType}' handler could not be set up, unique config.hostname is required for named queue subscriptions`);

		const handlerKey = `${queueName}:${messageType}`;
		if (this[_namedQueues].has(handlerKey))
			throw new Error(`'${handlerKey}' handler already set up on this node`);

		this[_namedQueues].set(`${queueName}:${messageType}`, handler);

		return this[_eventBus].on(messageType, event => {

			if (event.context.hostname !== this.config.hostname) {
				info(`'${event.type}' committed on node '${event.context.hostname}', '${this.config.hostname}' handler will be skipped`);
				return;
			}

			handler(event);
		});
	}

	/**
	 * Creates one-time subscription for one or multiple events that match a filter
	 *
	 * @param {string[]} messageTypes - Array of event type to subscribe to
	 * @param {function(IEvent):any} [handler] - Optional handler to execute for a first event received
	 * @param {function(IEvent):boolean} [filter] - Optional filter to apply before executing a handler
	 * @return {Promise<IEvent>} Resolves to first event that passes filter
	 */
	once(messageTypes, handler, filter) {
		if (!Array.isArray(messageTypes)) messageTypes = [messageTypes];
		if (messageTypes.filter(t => !t || typeof t !== 'string').length)
			throw new TypeError('messageType argument must be either a non-empty String or an Array of non-empty Strings');
		if (handler && typeof handler !== 'function')
			throw new TypeError('handler argument, when specified, must be a Function');
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when specified, must be a Function');

		const emitter = this[_eventBus];

		return new Promise(resolve => {

			// handler will be invoked only once,
			// even if multiple events have been emitted before subscription was destroyed
			// https://nodejs.org/api/events.html#events_emitter_removelistener_eventname_listener
			let handled = false;

			function filteredHandler(event) {
				if (filter && !filter(event)) return;
				if (handled) return;
				handled = true;

				for (const messageType of messageTypes) {
					if (typeof emitter.removeListener === 'function')
						emitter.removeListener(messageType, filteredHandler);
					else
						emitter.off(messageType, filteredHandler);
				}

				debug(`'${event.type}' received, one-time subscription to '${messageTypes.join(',')}' removed`);

				if (handler)
					handler(event);

				resolve(event);
			}

			for (const messageType of messageTypes)
				emitter.on(messageType, filteredHandler);

			debug(`set up one-time ${filter ? 'filtered subscription' : 'subscription'} to '${messageTypes.join(',')}'`);
		});
	}
};
