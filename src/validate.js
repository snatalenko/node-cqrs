'use strict';

// class DomainError extends Error {
// 	constructor(message) {
// 		super(message);
// 	}
// }
// function domainError(message) {
// 	throw new DomainError(message);
// }

exports.argument = function (value, argumentName) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (!value) throw new TypeError(argumentName + ' argument required');
};

exports.string = function (value, argumentName) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (typeof value !== 'string' || !value.length) throw new TypeError(argumentName + ' argument must be a non-empty String');
};

exports.url = function (value, argumentName) {
	exports.string(value, argumentName);
	if (!/^(http|https):\/\//i.test(value)) throw new TypeError(argumentName + ' argument must be a url');
};

exports.func = function (value, argumentName) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (typeof value !== 'function') throw new TypeError(argumentName + ' argument must be a Function');
};

exports.number = function (value, argumentName) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (typeof value !== 'number' || isNaN(value)) throw new TypeError(argumentName + ' argument must be a Number');
};

exports.array = function (value, argumentName) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (!Array.isArray(value) || !value.length) throw new TypeError(argumentName + ' argument must be a non-empty Array');
};

exports.object = function (value, argumentName, requiredProperties) {
	if (!argumentName) throw new TypeError('argumentName argument required');
	if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) throw new TypeError(argumentName + ' argument must be an Object');
	if (requiredProperties) {
		if (!Array.isArray(requiredProperties)) requiredProperties = Array.prototype.slice.call(arguments, 2);
		for (const propertyName of requiredProperties) {
			if (!(propertyName in value)) throw new TypeError(argumentName + '.' + propertyName + ' is not defined');
		}
	}
};

exports.identifier = function (value, argumentName) {
	if (typeof value === 'object' && value) value = value.toString();
	exports.string(value, argumentName);
};

exports.context = function (context, argumentName) {
	if (!argumentName) argumentName = 'context';
	exports.object(context, argumentName);
	exports.string(context.browser, argumentName + '.browser');
	exports.string(context.ip, argumentName + '.ip');
	if ('uid' in context) {
		exports.identifier(context.uid, argumentName + '.uid');
	}
};

exports.userContext = function (context, argumentName) {
	if (!argumentName) argumentName = 'context';
	exports.context(context, argumentName);
	exports.argument(context.uid, argumentName + '.uid');
};

exports.event = function (event) {
	exports.object(event, 'event');
	exports.identifier(event.aggregateId, 'event.aggregateId');
	exports.string(event.type, 'event.type');
	exports.userContext(event.context, 'event.context');
};
