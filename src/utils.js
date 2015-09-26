'use strict';

/**
 * Gets a handler for a specific message type, prefers a public (w\o _ prefix) method, if available
 * @param  {Object} context
 * @param  {String} messageType
 * @return {Function}
 */
exports.getHandler = function (context, messageType) {
	if (!context || typeof context !== 'object') throw new TypeError('context argument required');
	if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty string');

	if (messageType in context && typeof context[messageType] === 'function')
		return context[messageType];

	const privateHandlerName = '_' + messageType;
	if (privateHandlerName in context && typeof context[privateHandlerName] === 'function')
		return context[privateHandlerName];

	return null;
};

exports.canHandle = function (context, messageType) {
	return !!exports.getHandler(context, messageType);
};

/**
 * Validates whether a specific object can handle messageType and invokes a corresponding message handler ('_' + messageType)
 * @param  {Object} context
 * @param  {String} messageType
 * @param  {arguments} message handler arguments
 * @return {Object} result of the handler invokation
 */
exports.passToHandler = function (context, messageType) {
	const handler = exports.getHandler(context, messageType);
	if (!handler) throw new Error(messageType + ' handler is not defined');

	const args = Array.prototype.slice.call(arguments, 2);
	return handler.apply(context, args);
};

exports.passToHandlerAsync = function (context, messageType) {
	const args = Array.prototype.slice.call(arguments, 2);
	return new Promise(function (resolve, reject) {
		const handler = exports.getHandler(context, messageType);
		if (!handler) throw new Error(messageType + ' handler is not defined');

		resolve(handler.apply(context, args));
	});
};

/**
 * Calculates an approximate object size in bytes
 * @param  {Object} object
 * @return {Number} object size
 */
exports.sizeOf = function (object) {
	if (!object) throw new TypeError('object argument required');

	const queue = [object];
	let size = 0;

	for (let i = 0; i < queue.length; i++) {

		const obj = queue[i];

		if (typeof obj === 'boolean') {
			size += 4;
		}
		else if (typeof obj === 'number') {
			size += 8;
		}
		else if (typeof obj === 'string') {
			size += Buffer.byteLength(obj, 'utf-8');
		}
		else if (typeof obj === 'symbol') {
			size += 32;
		}
		else if (obj instanceof Date) {
			size += 40; //Buffer.byteLength(obj.toString(), 'utf-8');
		}
		else if (obj instanceof Buffer) {
			size += obj.length;
		}
		else if (obj) {
			if (!Array.isArray(obj)) {
				for (const key of Object.keys(obj)) {
					size += Buffer.byteLength(key, 'utf-8');
				}
			}
			for (const key of Object.keys(obj)) {
				const innerObj = obj[key];
				if (queue.indexOf(innerObj) === -1) {
					queue.push(innerObj);
				}
			}
		}
	}

	return size;
};
