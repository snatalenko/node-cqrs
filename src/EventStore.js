'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const ConcurrencyError = require('./errors/ConcurrencyError');
const debug = require('debug')('cqrs:debug:EventStore');
const info = require('debug')('cqrs:info:EventStore');
const coWrap = require('./utils/coWrap');

const COMMIT_RETRIES_LIMIT = 5;
const STORAGE_METHODS = [
	'commitEvents',
	'getEvents',
	'getAggregateEvents',
	'getSagaEvents',
	'getNewId'
];
const EMITTER_METHODS = [
	'on'
];

const _storage = Symbol('storage');
const _bus = Symbol('bus');
const _emitter = Symbol('emitter');
const _validator = Symbol('validator');
const _config = Symbol('config');
const _defaults = {
	hostname: undefined,
	publishAsync: true
};

const _namedQueues = Symbol('queueHandlers');

/**
 * Format event stream summary for debug output
 *
 * @param {IEvent[]} events
 * @returns {string}
 */
function eventsToString(events) {
	if (!events) events = this;
	if (!Array.isArray(events)) {
		return events;
	}
	else if (events.length === 1) {
		return `'${events[0].type}'`;
	}
	return `${events.length} events`;
}

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
 * Check whether instance has all listed methods
 *
 * @param {object} instance
 * @param {...string} methodNames
 * @returns {boolean}
 */
function respondsTo(instance, ...methodNames) {
	return methodNames.findIndex(methodName => typeof instance[methodName] !== 'function') === -1;
}

/**
 * Check if emitter support named queues
 *
 * @param {object} emitter
 * @returns {boolean}
 */
function emitterSupportsQueues(emitter) {
	const emitterPrototype = Object.getPrototypeOf(emitter);
	const EmitterType = emitterPrototype.constructor;
	return EmitterType && !!EmitterType.supportsQueues;
}

/**
 * Attaches command and node fields to each event in a given array
 *
 * @param {IEvent[]} events
 * @param {{ context, sagaId, sagaVersion }} sourceCommand
 * @param {{ hostname }} eventStoreConfig
 * @returns {IEvent[]}
 */
function augmentEvents(events, sourceCommand = {}, eventStoreConfig) {
	if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

	const { sagaId, sagaVersion, context } = sourceCommand;
	const { hostname } = eventStoreConfig;

	const extension = {
		sagaId,
		sagaVersion,
		context: Object.assign({ hostname }, context)
	};

	return events.map(event => Object.assign({}, extension, event));
}

/**
 * CQRS Event
 * @typedef {{ type: string, aggregateId: string, aggregateVersion: number, sagaId:string, sagaVersion:number }} IEvent
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
	 * Creates an instance of EventStore.
	 *
	 * @param {{ storage, messageBus, eventValidator, eventStoreConfig }} options
	 */
	constructor({ storage, messageBus, eventValidator, eventStoreConfig }) {
		if (!storage)
			throw new TypeError('storage argument required');
		if (!respondsTo(storage, ...STORAGE_METHODS))
			throw new TypeError(`storage does not support methods: ${STORAGE_METHODS.filter(methodName => !respondsTo(storage, methodName))}`);
		if (messageBus !== undefined && !respondsTo(messageBus, ...EMITTER_METHODS))
			throw new TypeError(`messageBus does not support methods: ${EMITTER_METHODS.filter(methodName => !respondsTo(messageBus, methodName))}`);
		if (eventValidator !== undefined && typeof eventValidator !== 'function')
			throw new TypeError('eventValidator, when provided, must be a function');

		coWrap(this);

		Object.defineProperties(this, {
			[_config]: { value: Object.freeze(Object.assign({}, EventStore.defaults, eventStoreConfig)) },
			[_storage]: { value: storage },
			[_validator]: { value: eventValidator || validateEvent },
			[_namedQueues]: { value: new Map() }
		});

		if (messageBus) {
			Object.defineProperties(this, {
				[_bus]: { value: messageBus },
				[_emitter]: { value: messageBus }
			});
		}
		else if (respondsTo(storage, ...EMITTER_METHODS)) {
			Object.defineProperties(this, {
				[_bus]: { value: null },
				[_emitter]: { value: storage }
			});
		}
		else {
			const bus = new InMemoryBus();
			Object.defineProperties(this, {
				[_bus]: { value: bus },
				[_emitter]: { value: bus }
			});
		}
	}

	/**
	 * Retrieve new ID from the storage
	 *
	 * @returns {Promise<string>}
	 */
	getNewId() {
		return new Promise(resolve => {
			resolve(this[_storage].getNewId());
		});
	}

	/**
	 * Retrieve all events of specific types
	 *
	 * @param {string[]} eventTypes
	 * @returns {Promise<IEvent[]>}
	 */
	* getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		debug(`retrieving ${eventTypes ? eventTypes.join(', ') : 'all'} events...`);

		const events = yield this[_storage].getEvents(eventTypes) || [];
		debug(`${eventsToString(events)} retreieved`);

		return events;
	}

	/**
	 * Retrieve all events of specific Aggregate
	 *
	 * @param {string|number} aggregateId
	 * @returns {Promise<IEvent[]>}
	 */
	* getAggregateEvents(aggregateId) {
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const events = yield this[_storage].getAggregateEvents(aggregateId) || [];
		debug(`${eventsToString(events)} retreieved`);

		return events;
	}

	/**
	 * Retrieve events of specific Saga
	 *
	 * @param {string} sagaId
	 * @param {{eventId: string, sagaVersion: number}} options
	 * @returns {Promise<IEvent[]>}
	 */
	* getSagaEvents(sagaId, options) {
		if (!sagaId) throw new TypeError('sagaId argument required');

		// 'except' and 'before' are deprecated, left here for backward compatibility.
		// options argument should contain sagaVersion and eventId, so the logic of
		// event stream retrieval will be handled by the EventStore
		const sagaVersion = options && (options.sagaVersion || options.before);
		const eventId = options && (options.eventId || options.except);

		debug(`retrieving event stream for saga ${sagaId}, v${sagaVersion}, except ${eventId}...`);

		const events = yield this[_storage].getSagaEvents(sagaId, { except: eventId }) || [];
		debug(`${eventsToString(events)} retreieved`);

		if (options && Object.keys(options).length) {
			const filteredEvents = events.filter(e => typeof eventId === 'undefined' || e.id != eventId); // eslint-disable-line eqeqeq
			if (filteredEvents.length !== events.length) {
				debug(`${events.length - filteredEvents.length} events excluded by filter: %o`, options);
			}
			return filteredEvents;
		}

		return events;
	}

	/**
	 * Validate events, commit to storage and publish to messageBus, if needed
	 *
	 * @param {IEvent[]} events - a set of events to commit
	 * @returns {Promise<IEvent[]>} - resolves to signed and committed events
	 */
	* commit(events, { sourceCommand, iteration = 0 } = {}) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');
		if (!events.length) return events;

		debug(`augmenting ${eventsToString(events)} from source command...`);
		events = augmentEvents(events, sourceCommand, { hostname: this.config.hostname });

		debug(`validating ${eventsToString(events)}...`);
		events.forEach(event => {
			this[_validator](event);
		});

		try {
			debug(`committing ${eventsToString(events)}...`);
			yield this[_storage].commitEvents(events);
		}
		catch (err) {
			if (err.name === ConcurrencyError.name && iteration < COMMIT_RETRIES_LIMIT) {
				return this.commit(events, {
					sourceCommand,
					iteration: iteration + 1
				});
			}
			throw err;
		}

		if (this[_bus]) {
			const publishEvents = () =>
				Promise.all(events.map(event => this[_bus].publish(event)))
					.then(() => {
						info(`${eventsToString(events)} published`);
					}, err => {
						info(`${eventsToString(events)} publishing failed: ${err}`);
						throw err;
					});

			if (this.config.publishAsync) {
				debug(`publishing ${eventsToString(events)} asynchronously...`);
				setImmediate(publishEvents);
			}
			else {
				debug(`publishing ${eventsToString(events)} synchronously...`);
				yield publishEvents();
			}
		}

		return events;
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

		// named queue subscriptions
		if (queueName && !emitterSupportsQueues(this[_emitter])) {
			if (!this.config.hostname)
				throw new Error(`'${messageType}' handler could not be set up, unique config.hostname is required for named queue subscriptions`);

			const handlerKey = `${queueName}:${messageType}`;
			if (this[_namedQueues].has(handlerKey))
				throw new Error(`'${handlerKey}' handler already set up on this node`);

			this[_namedQueues].set(`${queueName}:${messageType}`, handler);

			return this[_emitter].on(messageType, event => {

				if (event.context.hostname !== this.config.hostname) {
					info(`'${event.type}' committed on node '${event.context.hostname}', '${this.config.hostname}' handler will be skipped`);
					return;
				}

				handler(event);
			});
		}

		return this[_emitter].on(messageType, handler, { queueName });
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

		const emitter = this[_emitter];
		const unsubscribeMethodName = respondsTo(emitter, 'removeListener') ?
			'removeListener' :
			'off';

		return new Promise(resolve => {

			debug(`setting up one-time ${filter ? 'filtered subscription' : 'subscription'} to '${messageTypes.join(', ')}'...`);

			function filteredHandler(event) {
				if (!filter || filter(event)) {
					info(`'${event.type}' received, one-time subscription removed`);

					for (const messageType of messageTypes) {
						emitter[unsubscribeMethodName](messageType, filteredHandler);
					}
					if (handler) {
						handler(event);
					}
					resolve(event);
				}
			}

			for (const messageType of messageTypes) {
				emitter.on(messageType, filteredHandler);
			}
		});
	}
};
