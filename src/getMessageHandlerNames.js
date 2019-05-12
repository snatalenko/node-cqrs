'use strict';

const KNOWN_COMMON_FUNCTION_NAMES = [
	'constructor',
	'subscribe',
	'project',
	'apply',
	'handle',
	'makeSnapshot',
	'restoreSnapshot'
];

/**
 * Get message handler names from a command/event handler class.
 * Assumes all private method names start from underscore ("_").
 *
 * @param {any} type Command or event handler class
 * @returns {string[]}
 */
function getMessageHandlerNames(type) {
	if (typeof type !== 'function' || !type.prototype)
		throw new TypeError('type argument must be a Class');

	const properties = Object.getOwnPropertyDescriptors(type.prototype);
	return Object.keys(properties).filter(key =>
		!KNOWN_COMMON_FUNCTION_NAMES.includes(key) &&
		!key.startsWith('_') &&
		typeof properties[key].value === 'function');
}

module.exports = getMessageHandlerNames;
