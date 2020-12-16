'use strict';

import getMessageHandlerNames from './getMessageHandlerNames';

/**
 * Get a list of message types handled by observer
 */
export default function getHandledMessageTypes(
	observerInstanceOrClass: (object | Function) & { handles?: string[] }
): string[] {
	if (!observerInstanceOrClass)
		throw new TypeError('observerInstanceOrClass argument required');

	if (observerInstanceOrClass.handles)
		return observerInstanceOrClass.handles;

	const prototype = Object.getPrototypeOf(observerInstanceOrClass);
	if (prototype && prototype.constructor && prototype.constructor.handles)
		return prototype.constructor.handles;

	return getMessageHandlerNames(observerInstanceOrClass);
}
