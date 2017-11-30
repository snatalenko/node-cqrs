'use strict';

/**
 * Get instance class name
 *
 * @param {object} instance
 * @returns {string}
 */
module.exports = function getClassName(instance) {
	return Object.getPrototypeOf(instance).constructor.name;
};
