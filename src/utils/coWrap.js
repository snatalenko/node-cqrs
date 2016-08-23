'use strict';

const co = require('co');

/**
 * Replaces generator functions with functions that return Promises, using co.wrap
 * https://github.com/tj/co#var-fn--cowrapfn
 *
 * @param {object} instance
 * @param {string[]|string} methodNames
 */
module.exports = function coWrap(instance, methodNames) {
	if (!Array.isArray(methodNames))
		methodNames = Array.prototype.slice.call(arguments, 1);
	for (const methodName of methodNames) {
		Object.defineProperty(instance, methodName, {
			value: co.wrap(instance[methodName].bind(instance))
		});
	}
};
