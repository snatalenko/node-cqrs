import { type IMessageHandler, type IObservable, isObservableQueueProvider } from '../interfaces/index.ts';
import { assertArray, assertDefined, assertFunction, assertObject, assertObservable } from './assert.ts';
import { getHandler } from './getHandler.ts';
import { getMessageHandlerNames } from './getMessageHandlerNames.ts';

const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

/**
 * Get a list of message types handled by observer
 */
function getHandledMessageTypes(observerInstanceOrClass: (object | Function)): string[] {
	assertDefined(observerInstanceOrClass, 'observerInstanceOrClass');

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
	assertObservable(observable, 'observable');
	assertObject(observer, 'observer');

	const { masterHandler, messageTypes, queueName } = options;
	if (masterHandler)
		assertFunction(masterHandler, 'masterHandler');

	const subscribeTo = messageTypes || getHandledMessageTypes(observer);
	assertArray(subscribeTo, 'either options.messageTypes, observer.handles or ObserverType.handles');

	for (const messageType of unique(subscribeTo)) {
		const handler = masterHandler || getHandler(observer, messageType);
		assertFunction(handler, `'${messageType}' handler`);

		if (queueName) {
			if (!isObservableQueueProvider(observable))
				throw new TypeError('Observer does not support named queues');

			observable.queue(queueName).on(messageType, (event, meta) => handler.call(observer, event, meta));
		}
		else {
			observable.on(messageType, (event, meta) => handler.call(observer, event, meta));
		}
	}
}
