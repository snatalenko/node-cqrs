'use strict';

const { getHandler } = require('./utils');

const unique = arr => [...new Set(arr)];

/**
 * Subscribe observer to observable
 *
 * @param {IObservable} observable
 * @param {object} observer
 * @param {TSubscribeOptions} [options]
 */
function subscribe(observable, observer, options = {}) {
	if (typeof observable !== 'object' || !observable)
		throw new TypeError('observable argument must be an Object');
	if (typeof observable.on !== 'function')
		throw new TypeError('observable.on must be a Function');
	if (typeof observer !== 'object' || !observer)
		throw new TypeError('observer argument must be an Object');

	const { masterHandler, messageTypes, queueName } = options;
	if (masterHandler && typeof masterHandler !== 'function')
		throw new TypeError('masterHandler parameter, when provided, must be a Function');
	if (queueName && typeof observable.queue !== 'function')
		throw new TypeError('observable.queue, when queueName is specified, must be a Function');

	const subscribeTo = messageTypes
		|| observer.handles
		|| Object.getPrototypeOf(observer).constructor.handles;
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

module.exports = subscribe;
