'use strict';

const getHandler = require('./getHandler');

module.exports = function validateHandlers(instance) {
	if (!instance) throw new TypeError('instance argument required');

	const messageTypes = Object.getPrototypeOf(instance).constructor.handles;
	if (!Array.isArray(messageTypes)) throw new TypeError('handles getter must return an Array');

	messageTypes.forEach(type => {
		if (!getHandler(instance, type))
			throw new Error(`'${type}' handler is not defined or not a function`);
	});
};
