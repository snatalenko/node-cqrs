'use strict';

const { getHandler } = require('./utils');

const unique = arr => [...new Set(arr)];

/**
 * Subscribe observer to observable
 *
 * @param {IObservable} observable
 * @param {IObserver} observer
 * @param {object} [options]
 * @param {string[]} [options.messageTypes]
 * @param {IMessageHandler} [options.masterHandler]
 * @param {string} [options.queueName]
 */
function subscribe(observable, observer, options) {
	if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
	if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
	if (typeof observer !== 'object' || !observer) throw new TypeError('observer argument must be an Object');

	const { masterHandler, messageTypes, queueName } = options;
	if (masterHandler && typeof masterHandler !== 'function')
		throw new TypeError('masterHandler parameter, when provided, must be a Function');

	const subscribeTo = messageTypes || observer.handles || Object.getPrototypeOf(observer).constructor.handles;
	if (!Array.isArray(subscribeTo))
		throw new TypeError('either options.messageTypes, observer.handles or ObserverType.handles is required');

	unique(subscribeTo).forEach(messageType => {
		const handler = masterHandler || getHandler(observer, messageType);
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		if (queueName)
			observable.queue(queueName).on(messageType, handler.bind(observer));
		else
			observable.on(messageType, handler.bind(observer));
	});
}

/**
 * @class Observer
 * @implements {IObserver}
 */
class Observer {

	/**
	 * Returns an array of handled message types. Should be overridden
	 *
	 * @returns {string[]} - handled message types (e.g. ['somethingHappened'])
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
	 * @param {object} options
	 * @returns
	 */
	static subscribe(observable, observer, options) {
		return subscribe(observable, observer, options);
	}

	/**
	 * Subscribes to events or commands emitted by observable instance
	 *
	 * @param {IObservable} observable
	 * @param {string[]} [messageTypes] a list of messages this observer listens to
	 * @param {IMessageHandler} [masterHandler] a master handler method to execute for all messages
	 */
	subscribe(observable, messageTypes, masterHandler) {
		return subscribe(observable, this, { messageTypes, masterHandler });
	}
}

module.exports = Observer;
