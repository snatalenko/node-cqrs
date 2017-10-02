'use strict';

const debug = require('debug');

/**
 * Attach debug(..) and info(..) methods to provided instance
 *
 * @param {object} instance
 */
module.exports = function attachLogMethods(instance) {
	if (typeof instance !== 'object' || !instance) throw new TypeError('instance argument must be an Object');

	const { name } = Object.getPrototypeOf(instance).constructor;
	if (!name) throw new TypeError('instance constructor name could not be resolved');

	Object.defineProperties(instance, {
		debug: {
			value: debug(`cqrs:debug:${name}`),
			configurable: true,
			writable: true
		},
		info: {
			value: debug(`cqrs:info:${name}`),
			configurable: true,
			writable: true
		}
	});
};
