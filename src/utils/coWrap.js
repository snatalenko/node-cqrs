'use strict';

const co = require('co');

// Detection of whether function is a generator from co source code
// For details see http://stackoverflow.com/a/37865170/4573999
function isGenerator(obj) {
	return typeof obj.next === 'function' && typeof obj.throw === 'function';
}

function isGeneratorFunction(obj) {
	const constructor = obj.constructor;
	if (!constructor) return false;
	if (constructor.name === 'GeneratorFunction' || constructor.displayName === 'GeneratorFunction') return true;
	return isGenerator(constructor.prototype);
}

/**
* List instance own generator method names
*
* @param {object} instance
* @returns {string[]}
*/
function getInstanceGeneratorNames(instance) {
	const prototype = Object.getPrototypeOf(instance);
	return Object.getOwnPropertyNames(prototype)
		.filter(methodName => {
			if (methodName === 'constructor')
				return false;

			const descriptor = Reflect.getOwnPropertyDescriptor(prototype, methodName);
			return descriptor
				&& descriptor.writable
				&& descriptor.configurable
				&& isGeneratorFunction(instance[methodName]);
		});
}

/**
* Replaces generator functions with functions that return Promises, using co.wrap
* https://github.com/tj/co#var-fn--cowrapfn
*
* @param {object} instance
* @param {string[]} [methodNames]
*/
module.exports = function coWrap(instance, ...methodNames) {
	if (!methodNames || !methodNames.length) {
		methodNames = getInstanceGeneratorNames(instance);
	}

	for (const val of methodNames) {
		const name = typeof val === 'string' ? val : val.name;
		const method = typeof val === 'function' ? val : instance[val];
		Object.defineProperty(instance, name, {
			value: co.wrap(method.bind(instance))
		});
	}
};
