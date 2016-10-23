'use strict';

const getHandler = require('./utils/getHandler');
const debug = require('debug');

module.exports = class Observer {

	// can be overridden to return an Array of handler message types
	// e.g. ['somethingHappened', 'anotherHappened']
	static get handles() {
		return null;
	}

	constructor() {
		Object.defineProperties(this, {
			debug: {
				value: debug('cqrs:debug:' + Object.getPrototypeOf(this).constructor.name),
				configurable: true
			},
			info: {
				value: debug('cqrs:info:' + Object.getPrototypeOf(this).constructor.name),
				configurable: true
			}
		});
	}

	/**
	 * Subscribes to events or commands emitted by observable instance
	 * @param  {Object}	observable
	 * @param  {Array}	messageTypes 	a list of messages this observer listens to (OPTIONAL, if provided during instantination)
	 * @param  {String} masterHandler 	a master handler method or method name to execute for all messages (OPTIONAL, if provided during instantination)
	 * @return {undefined}
	 */
	subscribe(observable, messageTypes, masterHandler) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (!messageTypes) messageTypes = this.handles || Object.getPrototypeOf(this).constructor.handles;
		if (!Array.isArray(messageTypes)) throw new TypeError('messageTypes argument must be an Array');
		if (masterHandler) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
		}

		return messageTypes.map(messageType => {
			const handler = masterHandler || getHandler(this, messageType);
			if (!handler)
				throw new Error(`'${messageType}' handler is not defined or not a function`);

			return this.listenTo(observable, messageType, handler);
		});
	}

	/**
	 * Subscribes to one message type emitted by observable instance
	 * @param  {Object} observable	Observable instance
	 * @param  {String} messageType Message type to listen to
	 * @param  {Function} handler 	Message hanlder method, will be bound to the observer instance automatically
	 * @return {undefined}			Whatever the observable.on method returns
	 */
	listenTo(observable, messageType, handler) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty string');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		const r = observable.on(messageType, handler.bind(this));

		this.debug(`listening to '${messageType}'`);

		return r;
	}
};
