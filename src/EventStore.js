'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:EventStore');

const _storage = Symbol('storage');
const _messageBus = Symbol('messageBus');
const _validator = Symbol('validator');

function debugAsync(messageFormat) {
	return events => {
		debug(messageFormat, !Array.isArray(events) ? events :
			events.length === 1 ? '\'' + events[0].type + '\'' :
			events.length + ' events');
		return events;
	};
}

function validateEventDafault(event) {
	if (typeof event !== 'object' || !event) throw new TypeError('event must be an Object');
	if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type must be a non-empty String');
	if (!event.aggregateId && !event.sagaId) throw new TypeError('either event.aggregateId or event.sagaId is required');
}

function validateEvents(validate) {
	if (typeof validate !== 'function') throw new TypeError('validate argument must be a Function');

	return events => new Promise(function (resolve, reject) {
		events.forEach(validate);
		resolve(events);
	});
}

/** Creates a function that commits events to a specified storage and returns a Promise that resolves to events passed in */
function commitEventsToStorage(storage) {
	if (!storage) throw new TypeError('storage argument required');

	return events => Promise.resolve(storage.commitEvents(events))
		.then(() => events);
}

function publishEventsSync(messageBus) {
	return events => Promise.all(events.map(event => messageBus.publish(event)))
		.then(results => {
			debug(`${events.length === 1 ? '\'' + events[0].type + '\'' : events.length + ' events'} processed`);
			return events;
		})
		.catch(err => {
			debug(`${events.length === 1 ? '\'' + events[0].type + '\'' : events.length + ' events'} processing has failed`);
			debug(err);
			throw err;
		});
}

function publishEventsAsync(messageBus) {
	return events => {
		setImmediate(publishEventsSync(messageBus), events);
		// publishEventsSync(messageBus)(events);
		return events;
	};
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
		this.validator = options.validator || validateEventDafault;
	}

	getNewId() {
		return Promise.resolve(this.storage.getNewId());
	}

	getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		return Promise.resolve(this.storage.getEvents(eventTypes) || [])
			.then(debugAsync('retrieved %s'));
	}

	getAggregateEvents(aggregateId) {
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		debug(`retrieving event stream for aggregate ${aggregateId}...`);

		return Promise.resolve(this.storage.getAggregateEvents(aggregateId) || [])
			.then(debugAsync('retrieved %s'));
	}

	/**
	 * Retrieves events, by sagaId
	 * @param  {String} sagaId  		Saga ID
	 * @param  {Object} options 		Parameter object with request options
	 * @param  {Array}  options.except 	Event ID(s) that triggered Saga execution and should be excluded from output
	 * @return {Promise}        		Resolving to an array of events
	 */
	getSagaEvents(sagaId, options) {
		if (!sagaId) throw new TypeError('sagaId argument required');

		debug(`retrieving event stream for saga ${sagaId}...`);

		// options.except is passed to storage method for faster filtering, if implemented.
		// for case when it's not implemented, a returned events list is filtered manually
		return Promise.resolve(this.storage.getSagaEvents(sagaId, options) || [])
			.then(events => {
				if (options && options.except) {
					if (Array.isArray(options.except)) {
						return events.filter(e => options.except.indexOf(e.id || e._id) === -1);
					} else {
						return events.filter(e => (e.id || e._id) !== options.except);
					}
				} else {
					return events;
				}
			})
			.then(debugAsync('retrieved %s'));
	}


	/**
	 * Sign, validate, and commit events to storage
	 * @param  {Array} 	events 	a set of events to commit
	 * @return {Promise}		resolves to signed and committed events
	 */
	commit(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

		return Promise.resolve(events)
			.then(debugAsync('validating %s...'))
			.then(validateEvents(this.validator))
			.then(debugAsync('comitting %s...'))
			.then(commitEventsToStorage(this.storage))
			.then(debugAsync('%s committed successfully, publishing asynchronously...'))
			.then(publishEventsAsync(this.bus))
			.catch(err => {
				debug('events commit has failed:');
				debug(err);
				throw err;
			});
	}

	on(messageType, handler) {
		return this.bus.on(messageType, handler);
	}

	once(messageType, handler, filter) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');
		if (typeof filter !== 'function') throw new TypeError('filter argument must be a Function');

		const bus = this.bus;

		function filteredHandler(event) {
			if (filter(...arguments)) {
				bus.off(messageType, filteredHandler);
				handler(...arguments);
			}
		}

		return this.on(messageType, filteredHandler);
	}
};
