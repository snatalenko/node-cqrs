import { IMessageHandler, IObservable } from '../interfaces';
import { getHandler } from './getHandler';
import { getMessageHandlerNames } from './getMessageHandlerNames';

const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

/**
 * Get a list of message types handled by observer
 */
export function getHandledMessageTypes(observerInstanceOrClass: (object | Function)): string[] {
	if (!observerInstanceOrClass)
		throw new TypeError('observerInstanceOrClass argument required');

	const prototype = Object.getPrototypeOf(observerInstanceOrClass);
	if (prototype && prototype.constructor && prototype.constructor.handles)
		return prototype.constructor.handles;

	return getMessageHandlerNames(observerInstanceOrClass);
}

/**
 * Subscribe observer to observable
 */
export function subscribe(
	observable: IObservable,
	observer: object,
	options: {
		messageTypes?: string[],
		masterHandler?: IMessageHandler,
		queueName?: string
	} = {}
) {
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

	const subscribeTo = messageTypes || getHandledMessageTypes(observer);
	if (!Array.isArray(subscribeTo))
		throw new TypeError('either options.messageTypes, observer.handles or ObserverType.handles is required');

	for (const messageType of unique(subscribeTo)) {
		const handler = masterHandler || getHandler(observer, messageType);
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		if (queueName) {
			if (!observable.queue)
				throw new TypeError('Observer does not support named queues');

			observable.queue(queueName).on(messageType, handler);
		}
		else {
			observable.on(messageType, handler);
		}
	}
}
