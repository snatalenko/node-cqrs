'use strict';

/**
 * Gets a handler for a specific message type, prefers a public (w\o _ prefix) method, if available
 * @param  {Object} context
 * @param  {String} messageType
 * @return {Function}
 */
module.exports = function getHandler(context, messageType) {
	if (!context || typeof context !== 'object') throw new TypeError('context argument required');
	if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty string');

	if (messageType in context && typeof context[messageType] === 'function')
		return context[messageType];

	const privateHandlerName = `_${messageType}`;
	if (privateHandlerName in context && typeof context[privateHandlerName] === 'function')
		return context[privateHandlerName];

	return null;
};
