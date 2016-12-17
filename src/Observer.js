'use strict';

const getHandler = require('./utils/getHandler');
const debug = require('debug');

/**
 * Observable type
 * @typedef {{ on:(type: string, handler: (message) => void) => void }} IObservable
 */

/**
 * Observer type
 * @typedef {object} IObserver
 */

module.exports = class Observer {

	/**
	 * Returns an array of handled message types. Should be overridden
	 *
	 * @returns {string[]} - handled message types (e.g. ['somethingHappened', 'anotherHappened'])
	 * @static
	 * @readonly
	 */
	static get handles() {
		return null;
	}

	/**
	 * Subscribe observer to observable
	 *
	 * @static
	 * @param {IObservable} observable
	 * @param {IObserver} observer
	 * @param {{ handles: string[], masterHandler: string|function, queueName: string }}
	 * @returns
	 */
	static subscribe(observable, observer, { messageTypes, masterHandler, queueName } = {}) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (typeof observer !== 'object' || !observer) throw new TypeError('observer argument must be an Object');

		messageTypes = messageTypes || observer.handles || Object.getPrototypeOf(observer).constructor.handles;
		if (!Array.isArray(messageTypes))
			throw new TypeError('either options.messageTypes, observer.handles or ObserverType.handles is required');

		if (masterHandler) {
			if (typeof masterHandler === 'string') masterHandler = observer[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
		}

		const options = queueName ? { queueName } : undefined;

		return messageTypes.map(messageType => {
			const handler = masterHandler || getHandler(observer, messageType);
			if (!handler)
				throw new Error(`'${messageType}' handler is not defined or not a function`);

			return observable.on(messageType, handler.bind(observer), options);
		});
	}

	/**
	 * Creates an instance of Observer
	 */
	constructor() {
		Object.defineProperties(this, {
			debug: {
				value: debug(`cqrs:debug:${Object.getPrototypeOf(this).constructor.name}`),
				configurable: true,
				writable: true
			},
			info: {
				value: debug(`cqrs:info:${Object.getPrototypeOf(this).constructor.name}`),
				configurable: true,
				writable: true
			}
		});
	}

	/**
	 * Subscribes to events or commands emitted by observable instance
	 *
	 * @param  {Object} observable
	 * @param  {Array} [messageTypes] a list of messages this observer listens to
	 * @param  {String} [masterHandler] a master handler method or method name to execute for all messages
	 * @returns {Promise<any[]>}
	 */
	subscribe(observable, messageTypes, masterHandler) {
		return Observer.subscribe(observable, this, { messageTypes, masterHandler });
	}
};
