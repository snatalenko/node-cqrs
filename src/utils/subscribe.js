'use strict';

const getHandler = require('./getHandler');

/**
 * Subscribe observer to observable
 *
 * @param {IObservable} observable
 * @param {IObserver} observer
 * @param {{ handles: string[], masterHandler: string|function, queueName: string }}
 */
module.exports = function subscribe(observable, observer, { messageTypes, masterHandler, queueName } = {}) {
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

	messageTypes.forEach(messageType => {
		const handler = masterHandler || getHandler(observer, messageType);
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		observable.on(messageType, handler.bind(observer), options);
	});
};
