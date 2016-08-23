'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:EventStore');
const coWrap = require('./utils/coWrap');

const _storage = Symbol('storage');
const _messageBus = Symbol('messageBus');
const _validator = Symbol('validator');

function eventsToString(events) {
	if (!events) events = this;
	return !Array.isArray(events) ? events :
		events.length === 1 ? '\'' + events[0].type + '\'' :
			events.length + ' events';
}

function validateEvent(event) {
	if (typeof event !== 'object' || !event) throw new TypeError('event must be an Object');
	if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type must be a non-empty String');
	if (!event.aggregateId && !event.sagaId) throw new TypeError('either event.aggregateId or event.sagaId is required');
	if (event.sagaId && typeof event.sagaVersion === 'undefined') throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
}


module.exports = class EventStore {

	get storage() {
		return this[_storage];
	}

	set storage(storage) {
		if (storage) {
			if (typeof storage.commitEvents !== 'function') throw new TypeError('storage.commitEvents must be a Function');
			if (typeof storage.getEvents !== 'function') throw new TypeError('storage.getEvents must be a Function');
			if (typeof storage.getAggregateEvents !== 'function') throw new TypeError('storage.getAggregateEvents must be a Function');
			if (typeof storage.getSagaEvents !== 'function') throw new TypeError('storage.getSagaEvents must be a Function');
			if (typeof storage.getNewId !== 'function') throw new TypeError('storage.getNewId must be a Function');
		}
		this[_storage] = storage || undefined;
	}

	get bus() {
		return this[_messageBus];
	}

	set bus(bus) {
		if (bus && typeof bus.publish !== 'function') throw new TypeError('bus.publish must be a Function');

		this[_messageBus] = bus || undefined;
	}

	get validator() {
		return this[_validator];
	}

	set validator(validator) {
		if (validator && typeof validator !== 'function') throw new TypeError('validator must be a Function');

		this[_validator] = validator || undefined;
	}

	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.storage) throw new TypeError('options.storage argument required');

		this.storage = options.storage;
		this.bus = options.messageBus || new InMemoryBus();
		this.validator = options.validator || validateEvent;
		this.publishAsync = 'publishAsync' in options ? !!options.publishAsync : true;

		coWrap(this, [
			'getAllEvents',
			'getAggregateEvents',
			'getSagaEvents',
			'commit'
		]);
	}

	getNewId() {
		return Promise.resolve(this.storage.getNewId());
	}

	*getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		const events = this.storage.getEvents(eventTypes) || [];
		debug(`${eventsToString(events)} retreieved`);

		return events;
	}

	*getAggregateEvents(aggregateId) {
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		debug(`retrieving event stream for aggregate ${aggregateId}...`);

		const events = yield this.storage.getAggregateEvents(aggregateId) || [];
		debug(`${eventsToString(events)} retreieved`);

		return events;
	}

	/**
	 * Retrieves events, by sagaId
	 *
	 * @param {string} sagaId
	 * @param {{before:number}} options
	 * @returns {PromiseLike<object[]>}
	 */
	*getSagaEvents(sagaId, options) {
		if (!sagaId) throw new TypeError('sagaId argument required');

		debug(`retrieving event stream for saga ${sagaId}...`);

		const events = yield this.storage.getSagaEvents(sagaId, options) || [];
		debug(`${eventsToString(events)} retreieved`);

		if (options && Object.keys(options).length) {
			const {after, before, except} = options;
			const filteredEvents = events.filter(e =>
				(typeof before === 'undefined' || e.sagaVersion < before) &&
				(typeof after === 'undefined' || e.sagaVersion > after) &&
				(typeof except === 'undefined' || e.id != except));
			debug(`${eventsToString(filteredEvents)} left after filtering by %o`, options);

			return filteredEvents;
		}
		else {
			return events;
		}
	}

	/**
	 * Sign, validate, and commit events to storage
	 *
	 * @param {object[]} events - a set of events to commit
	 * @returns {PromiseLike<object[]>} - resolves to signed and committed events
	 */
	*commit(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		debug(`validating ${eventsToString(events)}...`);
		yield events.map(this.validator);

		debug(`committing ${eventsToString(events)}...`);
		yield this.storage.commitEvents(events);

		if (this.publishAsync) {
			debug(`publishing ${eventsToString(events)} asynchronously...`);
			setImmediate(() => Promise.all(events.map(event => this.bus.publish(event))).then(result => {
				debug(`${eventsToString(events)} published`);
			}, err => {
				debug(`${eventsToString(events)} publishing failed: ${err.stack || err}`);
			}));
		}
		else {
			debug(`publishing ${eventsToString(events)} synchronously...`);
			yield events.map(event => this.bus.publish(event));
		}

		return events;
	}

	on(messageType, handler) {
		return this.bus.on(messageType, handler);
	}

	/**
	 * Creates one-time subscription for one or multiple events that match a filter
	 * @param  {Array} 		messageTypes 	Array of event type to subscribe to
	 * @param  {Function} 	handler      	Optional handler to execute for a first event received
	 * @param  {Function} 	filter       	Optional filter to apply before executing a handler
	 * @return {Promise}              		Resolves to first event that passes filter
	 */
	once(messageTypes, handler, filter) {
		if (!Array.isArray(messageTypes)) messageTypes = [messageTypes];
		if (messageTypes.filter(t => !t || typeof t !== 'string').length)
			throw new TypeError('messageType argument must be either a non-empty String or an Array of non-empty Strings');
		if (handler && typeof handler !== 'function')
			throw new TypeError('handler argument, when specified, must be a Function');
		if (filter && typeof filter !== 'function')
			throw new TypeError('filter argument, when specified, must be a Function');

		const messageBus = this.bus;

		return new Promise(function (resolve, reject) {

			debug(`setting up one-time ${filter ? 'filtered ' : ''}subscription to '${messageTypes.join(', ')}'...`);

			function filteredHandler(event) {
				if (!filter || filter(event)) {

					debug(`'${event.type}' received, one-time subscription removed`);

					for (const messageType of messageTypes) {
						messageBus.off(messageType, filteredHandler);
					}
					if (handler) {
						handler(event);
					}
					resolve(event);
				}
			}

			for (const messageType of messageTypes) {
				messageBus.on(messageType, filteredHandler);
			}
		});
	}
};
