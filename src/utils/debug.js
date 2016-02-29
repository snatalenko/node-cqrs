'use strict';

const debug = require('debug');
const PREFIX = 'cqrs:';

module.exports = function (instance) {
	if (!instance) throw new TypeError('instance argument required');
	return debug(PREFIX + Object.getPrototypeOf(instance).constructor.name);
};
