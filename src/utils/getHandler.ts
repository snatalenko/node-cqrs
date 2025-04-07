import { IMessageHandler } from '../interfaces';

/**
 * Gets a handler for a specific message type, prefers a public (w\o _ prefix) method, if available
 */
export function getHandler(context: { [key: string]: any }, messageType: string): IMessageHandler | null {
	if (!context || typeof context !== 'object')
		throw new TypeError('context argument required');
	if (typeof messageType !== 'string' || !messageType.length)
		throw new TypeError('messageType argument must be a non-empty string');

	if (messageType in context && typeof context[messageType] === 'function')
		return context[messageType].bind(context);

	const privateHandlerName = `_${messageType}`;
	if (privateHandlerName in context && typeof context[privateHandlerName] === 'function')
		return context[privateHandlerName].bind(context);

	return null;
}
