'use strict';

const EventEmitter = require('events').EventEmitter;
const validate = require('./validate');

const KEY_GATEWAYS = Symbol();
const KEY_PRIMARY_GATEWAY = Symbol();
const debug = function () {};

function debugEventNum(arr) {
	if (!Array.isArray(arr)) throw new TypeError('arr argument must be an Array');
	return arr.length === 1 ? '1 event' : arr.length + ' events';
}

class EventStore extends EventEmitter {

	get gateway() {
		if (!this[KEY_PRIMARY_GATEWAY]) throw new Error('gateway is not configured. invoke EventStore.use(gateway) method first');
		return this[KEY_PRIMARY_GATEWAY];
	}

	get gateways() {
		return this[KEY_GATEWAYS];
	}

	constructor(gateway, publishGateways) {
		super();
		this[KEY_GATEWAYS] = [];
		this.debug = debug;

		if (gateway) {
			this.use(gateway);
		}

		if (publishGateways) {
			if (!Array.isArray(publishGateways)) {
				publishGateways = Array.prototype.slice.call(arguments, 1);
			}
			for (const writeOnlyGateway of publishGateways) {
				this.publishTo(writeOnlyGateway);
			}
		}

		this._validate = this._validate.bind(this);
		this._commit = this._commit.bind(this);
		this._onEventsRetrieved = this._onEventsRetrieved.bind(this);
		this._emit = this._emit.bind(this);
	}

	use(gateway) {
		validate.object(gateway, 'gateway');
		validate.func(gateway.commitEvents, 'gateway.commitEvents');
		validate.func(gateway.getEvents, 'gateway.getEvents');
		validate.func(gateway.getAggregateEvents, 'gateway.getAggregateEvents');
		validate.func(gateway.getNewId, 'gateway.getNewId');

		this[KEY_PRIMARY_GATEWAY] = gateway;
		this.publishTo(gateway, true);
	}

	publishTo(gateway, last) {
		validate.object(gateway, 'gateway');
		validate.func(gateway.commitEvents, 'gateway.commitEvents');
		if (this.gateways.indexOf(gateway) !== -1) throw new TypeError('gateway is already registered');
		if (typeof last !== 'undefined' && typeof last !== 'boolean') throw new TypeError('last argument, when provided, must be a Boolean');

		if (last) {
			this.gateways.push(gateway);
		}
		else {
			this.gateways.splice(0, 0, gateway);
		}
	}

	getAllEvents(eventTypes) {
		if (eventTypes && !Array.isArray(eventTypes)) throw new TypeError('eventTypes, if specified, must be an Array');

		return Promise.resolve(this.gateway.getEvents(eventTypes) || [])
			.then(this._onEventsRetrieved);
	}

	getEvents(aggregateId) {
		this.debug('retrieving event stream for %s...', aggregateId);
		validate.identifier(aggregateId, 'aggregateId');

		return Promise.resolve(this.gateway.getAggregateEvents(aggregateId) || [])
			.then(this._onEventsRetrieved);
	}

	_onEventsRetrieved(events) {
		this.debug('retrieved %s', debugEventNum(events));
		return events;
	}

	/**
	 * Sign, validate and commit events to gateway
	 * @param  {Object} context events context
	 * @param  {Array} 	events 	a set of events to commit
	 * @return {Promise}		resolves to signed and committed events
	 */
	commit(context, events) {
		validate.argument(context, 'context');
		validate.argument(events, 'events');

		return Promise.resolve(events)
			.then(this._sign.bind(this, context))
			.then(this._validate)
			.then(this._commit)
			.then(this._emit);
	}

	_sign(context, events) {
		this.debug('sign %s', debugEventNum(events));
		validate.context(context);
		validate.array(events, 'events');

		for (const event of events) {
			event.context = context;
		}
		return events;
	}

	_validate(events) {
		this.debug('validate %s', debugEventNum(events));
		validate.array(events, 'events');

		return Promise.all(events.map(event => new Promise(function (resolve, reject) {
			validate.event(event, 'event');
			resolve(event);
		})));
	}

	_commit(events) {
		this.debug('commit %s', debugEventNum(events));
		validate.array(events, 'events');

		let insertAsync = Promise.resolve(events);
		for (const gateway of this.gateways) {
			insertAsync = insertAsync.then(this._commitToGateway.bind(this, gateway));
		}

		const self = this;
		return insertAsync.then(function (result) {
			self.debug('%s committed: %j', debugEventNum(events), result);
			return events;
		});
	}

	_commitToGateway(gateway, events) {
		validate.object(gateway, 'gateway');
		validate.array(events, 'events');

		return Promise.resolve(gateway.commitEvents(events));
	}

	_emit(events) {
		for (const event of events) {
			this.emit(event.type, event);
			this.emit('event', event);
			this.debug('\'%s\' handlers executed', event.type);
		}
		return events;
	}

	getNewId() {
		return this.gateway.getNewId();
	}
}

module.exports = EventStore;
