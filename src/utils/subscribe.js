'use strict';

const getHandler = require('./getHandler');

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
module.exports = function subscribe(observable, observer, options) {
	if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
	if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
	if (typeof observer !== 'object' || !observer) throw new TypeError('observer argument must be an Object');

	const { masterHandler, messageTypes, queueName } = options;
	if (masterHandler && typeof masterHandler !== 'function')
		throw new TypeError('masterHandler parameter, when provided, must be a Function');

	const subscribeTo = messageTypes || observer.handles || Object.getPrototypeOf(observer).constructor.handles;
	if (!Array.isArray(subscribeTo))
		throw new TypeError('either options.messageTypes, observer.handles or ObserverType.handles is required');

	const subscriptionOptions = queueName ? { queueName } : undefined;

	subscribeTo.forEach(messageType => {
		const handler = masterHandler || getHandler(observer, messageType);
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		observable.on(messageType, handler.bind(observer), subscriptionOptions);
	});
};
