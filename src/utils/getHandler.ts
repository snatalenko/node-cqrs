import { assertFunction, assertObject, assertString } from './assert.ts';

/**
 * Gets a handler for a specific message type, prefers a public (w\o _ prefix) method, if available
 */
export function getOptionalHandler(
	instance: { [key: string]: any },
	messageType: string
): ((...args: any) => unknown) | null {
	assertObject(instance, 'instance');
	assertString(messageType, 'messageType');

	if (messageType in instance && typeof instance[messageType] === 'function')
		return instance[messageType];

	const privateHandlerName = `_${messageType}`;
	if (privateHandlerName in instance && typeof instance[privateHandlerName] === 'function')
		return instance[privateHandlerName];

	return null;
}

export function getHandler(
	instance: { [key: string]: any },
	messageType: string
): (...args: any) => unknown {
	const handler = getOptionalHandler(instance, messageType);
	assertFunction(handler, messageType);
	return handler;
}
