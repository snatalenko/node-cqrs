'use strict';

const getHandler = require('./getHandler');

/**
 * Validates whether a specific object can handle messageType and invokes a corresponding message handler ('_' + messageType)
 * @param  {Object} context
 * @param  {String} messageType
 * @param  {...args} message handler arguments
 * @return {Object} result of the handler invokation
 */
module.exports = function passToHandler(context, messageType /*, ...args */ ) {
	if (!context) throw new TypeError('context argument required');
	if (!messageType) throw new TypeError('messageType argument required');

	const handler = getHandler(context, messageType);
	if (!handler)
		throw new Error(`'${messageType}' handler is not defined or not a function`);

	const args = Array.prototype.slice.call(arguments, 2);
	return handler.apply(context, args);
};
