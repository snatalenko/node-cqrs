'use strict';

const PARAMETER_OBJECT_NAME = 'options';
const RX_CONSTRUCTOR = /(?:constructor|^function.+\w+).?\(([^\)]*)\).?\{((?:[^{}]*|{[^{}]*})+)\}/;
const RX_PARAMETER_OBJECT = new RegExp(PARAMETER_OBJECT_NAME + '\\.([\\w]+)', 'g');

function distinct(array) {
	return [...new Set(array)];
}

/**
 * Retrieves parameter object names mentioned in constructor body (e.g. "options.someService")
 * @param  {String} ctorBody Constructor body
 * @return {Array}           A list of object names (e.g. ["someService"])
 */
function* getParameterObjectPropertyNames(ctorBody) {
	if (typeof ctorBody !== 'string' || !ctorBody.length) throw new TypeError('ctorBody argument must be a non-empty String');

	let match;
	while (match = RX_PARAMETER_OBJECT.exec(ctorBody)) {
		yield match[1];
	}
}

/**
 * Retrieves constructor parameter names from a class descriptor.
 * If parameter is a paramenter object, its property names will be returned as inner array.
 * @example
 * 	class X { constructor(options, service) { this._a = options.a; } }
 *  getClassDependencyNames(X) === [["a"], "service"]
 * @param  {Function} type Prototype function
 * @return {Array}         An array with dependency names. In case of parameter object,
 *                         dependency will be an array too (e.g. [["someService", "anotherService"]])
 */
module.exports = function getClassDependencyNames(type) {
	if (!type) throw new TypeError('type argument required');
	if (!type.prototype) throw new TypeError('type argument must be a Class: ' + type.toString());

	const classBody = type.toString();
	const match = classBody.match(RX_CONSTRUCTOR);
	if (!match) {
		const parentType = type.__proto__;
		if (parentType && parentType.prototype) {
			return getClassDependencyNames(parentType);
		} else {
			return null;
		}
	}

	const parameters = match[1].split(',').map(n => n.trim()).filter(n => n);
	return parameters.map(parameterName => {
		if (parameterName === PARAMETER_OBJECT_NAME) {
			return distinct(Array.from(getParameterObjectPropertyNames(match[2])));
		} else {
			return parameterName;
		}
	});
};
