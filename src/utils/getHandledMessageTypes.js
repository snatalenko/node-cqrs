'use strict';

const getMessageHandlerNames = require('./getMessageHandlerNames');

/**
 * Get a list of message types handled by observer
 * @param {object | function} observerInstanceOrClass
 * @returns {string[]}
 */
function getHandledMessageTypes(observerInstanceOrClass) {
	if (!observerInstanceOrClass)
		throw new TypeError('observerInstanceOrClass argument required');

	if (observerInstanceOrClass.handles)
		return observerInstanceOrClass.handles;

	const prototype = Object.getPrototypeOf(observerInstanceOrClass);
	if (prototype && prototype.constructor && prototype.constructor.handles)
		return prototype.constructor.handles;

	return getMessageHandlerNames(observerInstanceOrClass);
}

module.exports = getHandledMessageTypes;
