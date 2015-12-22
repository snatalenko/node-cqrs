'use strict';

const EventEmitter = require('events').EventEmitter;
const validate = require('./validate');

const KEY_GATEWAY = Symbol();

function signEventsContext(context) {
	if (!context) throw new TypeError('context argument required');

	return events => new Promise(function (resolve, reject) {
		validate.context(context);
		validate.array(events, 'events');

		events.forEach(e => e.context = context);
		resolve(events);
	});
}

function validateEvents(events) {
	if (!events) throw new TypeError('events argument required');
	if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');

	return new Promise(function (resolve, reject) {
		events.forEach(event => {
			validate.object(event, 'event');
			validate.identifier(event.aggregateId, 'event.aggregateId');
			validate.number(event.version, 'event.version');
			validate.string(event.type, 'event.type');
			validate.context(event.context, 'event.context');
		});
		resolve(events);
	});
}

/** Creates a function that commits events to a specified gateway and returns a Promise that resolves to events passed in */
function commitEventsToGateway(gateway) {
	if (!gateway) throw new TypeError('gateway argument required');

	return events => Promise.resolve(gateway.commitEvents(events))
		.then(() => events);
}

function emitEventsAsync(emitter, debug) {
	return events => {

		setImmediate(() => {
			try {
				events.forEach(event => {
					emitter.emit('event', event);
					emitter.emit(event.type, event);
					debug('\'%s\' handlers executed', event.type);
				});
				debug('%d event(s) processed', events.length);
			}
			catch (err) {
				debug('at least one of the event handlers has failed');
				debug(err);
			}
		});

		return events;
	};
}

class EventStore extends EventEmitter {

	get gateway() {
		if (!this[KEY_GATEWAY])
			throw new Error('gateway is not configured. invoke EventStore.use(gateway) method first');

		return this[KEY_GATEWAY];
	}

	set gateway(gateway) {
		if (typeof gateway !== 'object' || !gateway) throw new TypeError('gateway argument must be an Object');
		if (typeof gateway.commitEvents !== 'function') throw new TypeError('gateway.commitEvents must be a Function');
		if (typeof gateway.getEvents !== 'function') throw new TypeError('gateway.getEvents must be a Function');
		if (typeof gateway.getAggregateEvents !== 'function') throw new TypeError('gateway.getAggregateEvents must be a Function');
		if (typeof gateway.getNewId !== 'function') throw new TypeError('gateway.getNewId must be a Function');
		this[KEY_GATEWAY] = gateway;
	}

	constructor(gateway) {
		super();

		if (gateway) {
			this.gateway = gateway;
		}
	}

	getNewId() {
		return this.gateway.getNewId();
	}

	getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		return Promise.resolve(this.gateway.getEvents(eventTypes) || [])
			.then(this._log('retrieved %s'));
	}

	getAggregateEvents(aggregateId) {
		this.debug('retrieving event stream for %s...', aggregateId);
		if (!aggregateId) throw new TypeError('aggregateId argument required');

		return Promise.resolve(this.gateway.getAggregateEvents(aggregateId) || [])
			.then(this._log('retrieved %s'));
	}

	/**
	 * Sign, validate, and commit events to gateway
	 * @param  {Object} context events context
	 * @param  {Array} 	events 	a set of events to commit
	 * @return {Promise}		resolves to signed and committed events
	 */
	commit(context, events) {
		if (!context) throw new TypeError('context argument required');
		if (!events) throw new TypeError('events argument required');

		return Promise.resolve(events)
			.then(this._log('signing %s...'))
			.then(signEventsContext(context))
			.then(this._log('validating %s...'))
			.then(validateEvents)
			.then(this._log('comitting %s...'))
			.then(commitEventsToGateway(this.gateway))
			.then(this._log('%s processed successfully, emitting asynchronously...'))
			.then(emitEventsAsync(this, this.debug));
	}

	once(eventType, listener, filter) {
		if (!filter) {
			return super.once(...arguments);
		}
		else {
			const self = this;

			function handler(event) {
				if (filter(...arguments)) {
					self.removeListener(eventType, handler);
					listener(...arguments);
				}
			}

			super.on(eventType, handler);
		}
	}

	debug( /*...args*/ ) {
		// console.log(...arguments);
	}

	_log(messageFormat) {
		return events => {
			this.debug(messageFormat, !Array.isArray(events) ? events :
				events.length === 1 ? '1 event' :
				events.length + ' events');
			return events;
		};
	}
}

module.exports = EventStore;
