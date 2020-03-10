'use strict';

const { getHandler } = require('./utils');
const getHandledMessageTypes = require('./utils/getHandledMessageTypes');

const unique = arr => [...new Set(arr)];

/**
 * Subscribe observer to observable
 *
 * @param {IObservable} observable
 * @param {object} observer
 * @param {object} [options]
 * @param {string[]} [options.messageTypes]
 * @param {IMessageHandler} [options.masterHandler]
 * @param {string} [options.queueName]
 */
function subscribe(observable, observer, options = {}) {
	/* istanbul ignore if */
	if (typeof observable !== 'object' || !observable)
		throw new TypeError('observable argument must be an Object');
	/* istanbul ignore if */
	if (typeof observable.on !== 'function')
		throw new TypeError('observable.on must be a Function');
	/* istanbul ignore if */
	if (typeof observer !== 'object' || !observer)
		throw new TypeError('observer argument must be an Object');

	const { masterHandler, messageTypes, queueName } = options;
	/* istanbul ignore if */
	if (masterHandler && typeof masterHandler !== 'function')
		throw new TypeError('masterHandler parameter, when provided, must be a Function');
	/* istanbul ignore if */
	if (queueName && typeof observable.queue !== 'function')
		throw new TypeError('observable.queue, when queueName is specified, must be a Function');

	const subscribeTo = messageTypes || getHandledMessageTypes(observer);
	/* istanbul ignore if */
	if (!Array.isArray(subscribeTo))
		throw new TypeError('either options.messageTypes, observer.handles or ObserverType.handles is required');

	for (const messageType of unique(subscribeTo)) {
		const handler = masterHandler || getHandler(observer, messageType);
		/* istanbul ignore if */
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		if (queueName)
			observable.queue(queueName).on(messageType, handler);
		else
			observable.on(messageType, handler);
	}
}

module.exports = subscribe;
