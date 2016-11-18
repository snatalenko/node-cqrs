'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:debug:EventStore');
const info = require('debug')('cqrs:info:EventStore');
const coWrap = require('./utils/coWrap');

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
const _publishAsync = Symbol('publishAsync');

/**
 * CQRS Event
 * @typedef {object} IEvent
 * @property {string} type - Event type
 * @property {string|number} aggregateId - Aggregate root ID
 * @property {number} aggregateVersion - Aggregate root version
 * @property {string|number} sagaId - Saga ID
 * @property {number} sagaVersion - Saga version
 */

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


module.exports = class EventStore {

	/**
	 * Creates an instance of EventStore.
	 *
	 * @param {{storage, messageBus, validator:function(*):void, publishAsync: boolean}} options
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.storage) throw new TypeError('options.storage argument required');
		if (!respondsTo(options.storage, ...STORAGE_METHODS))
			throw new TypeError(`options.storage does not support all the methods: ${STORAGE_METHODS}`);
		if (options.messageBus && !respondsTo(options.messageBus, ...EMITTER_METHODS))
			throw new TypeError(`options.messageBus does not support all the methods: ${EMITTER_METHODS}`);
		if (options.validator && typeof options.validator !== 'function')
			throw new TypeError('options.validator, when provided, must be a function');
		if (options.messageBus !== undefined && !options.messageBus && !respondsTo(options.storage, ...EMITTER_METHODS))
			throw new TypeError(`either options.messageBus or options.storage must implement emitter methods: ${EMITTER_METHODS}`);

		coWrap(this);

		Object.defineProperties(this, {
			[_storage]: {
				value: options.storage
			},
			[_validator]: {
				value: options.validator || validateEvent
			},
			[_publishAsync]: {
				value: 'publishAsync' in options ? !!options.publishAsync : true
			}
		});

		if (options.messageBus) {
			Object.defineProperties(this, {
				[_bus]: { value: options.messageBus },
				[_emitter]: { value: options.messageBus }
			});
		}
		else if (respondsTo(options.storage, ...EMITTER_METHODS)) {
			Object.defineProperties(this, {
				[_bus]: { value: null },
				[_emitter]: { value: options.storage }
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
	* commit(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		debug(`validating ${eventsToString(events)}...`);
		yield events.map(this[_validator]);

		debug(`committing ${eventsToString(events)}...`);
		yield this[_storage].commitEvents(events);

		if (this[_bus]) {
			if (this[_publishAsync]) {
				debug(`publishing ${eventsToString(events)} asynchronously...`);
				setImmediate(() => Promise.all(events.map(event => this[_bus].publish(event))).then(() => {
					info(`${eventsToString(events)} published`);
				}, err => {
					info(`${eventsToString(events)} publishing failed: ${err.message || err}`);
				}));
			}
			else {
				debug(`publishing ${eventsToString(events)} synchronously...`);
				try {
					yield events.map(event => this[_bus].publish(event));
				}
				catch (err) {
					info(`${eventsToString(events)} publishing failed: ${err.message || err}`);
					throw err;
				}
			}
		}

		return events;
	}

	/**
	 * Setup a listener for a specific event type
	 *
	 * @param {string} messageType
	 * @param {function(IEvent):any} handler
	 * @returns {any}
	 */
	on(messageType, handler) {
		return this[_emitter].on(messageType, handler);
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
