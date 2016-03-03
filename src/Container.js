'use strict';

const debug = require('debug')('cqrs:Container');
const RX_CONSTRUCTOR = /constructor.?\(([^\)]*)\).?\{([^}]*)\}/;
const PARAMETER_OBJECT_NAME = 'options';

/**
 * Retrieves parameter object names mentioned in constructor body (e.g. "options.someService")
 * @param  {String} ctorBody Constructor body
 * @return {Array}           A list of object names (e.g. ["someService"])
 */
function getParameterObjectPropertyNames(ctorBody) {
	if (typeof ctorBody !== 'string' || !ctorBody.length) throw new TypeError('ctorBody argument must be a non-empty String');

	const rxOptions = new RegExp(PARAMETER_OBJECT_NAME + '\\.([\\w]+)', 'g');
	const options = [];

	let pm;
	while (pm = rxOptions.exec(ctorBody)) {
		const optionName = pm[1];
		if (options.indexOf(optionName) === -1)
			options.push(optionName);
	}

	return options;
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
function getClassDependencyNames(type) {
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
			return getParameterObjectPropertyNames(match[2]);
		} else {
			return parameterName;
		}
	});
}

function createInstance(typeOrFactory, container, additionalOptions) {
	if (typeof typeOrFactory !== 'function') throw new TypeError('typeOrFactory argument must be a Function');
	if (!container) throw new TypeError('container argument required');
	if (additionalOptions && (typeof additionalOptions !== 'object' || Array.isArray(additionalOptions)))
		throw new TypeError('additionalOptions argument, when specified, must be an Object');

	if (typeOrFactory.prototype) {

		const dependencies = getClassDependencyNames(typeOrFactory);

		if (!dependencies) {
			debug(`${typeOrFactory.name || 'instance'} has no constructor`);
		} else if (!dependencies.length) {
			debug(`${typeOrFactory.name || 'instance'} has no dependencies`);
		} else {
			debug(`${typeOrFactory.name || 'instance'} dependencies: ${dependencies}`);
		}

		const parameters = dependencies && dependencies.map(dependency => {
			if (typeof dependency === 'string') {
				return container[dependency];
			} else if (Array.isArray(dependency)) {
				const options = Object.assign({}, additionalOptions);
				dependency.forEach(key => options[key] || (options[key] = container[key]));
				return options;
			}
		});

		return new(Function.prototype.bind.apply(typeOrFactory, [null].concat(parameters)));

	} else {
		return typeOrFactory(container);
	}
}


module.exports = class Container {

	get factories() {
		return this._factories || (this._factories = []);
	}

	get instances() {
		return this._instances || (this._instances = {});
	}

	/**
	 * Registers a component in the container
	 * @param  {Function} 	typeOrFactory	Either a constructor function or a component factor
	 * @param  {String} 	exposeAs      	Optional component name to use for instance exposing on the container
	 * @param  {Function} 	exposeMap     	Optional Instance -> Object-to-Expose mapping
	 * @return {undefined}
	 */
	register(typeOrFactory, exposeAs, exposeMap) {
		if (typeof typeOrFactory !== 'function') throw new TypeError('typeOrFactory argument must be a Function');
		if (exposeAs && typeof exposeAs !== 'string') throw new TypeError('exposeAs argument, when provided, must be a non-empty string');
		if (exposeMap && typeof exposeMap !== 'function') throw new TypeError('exposeMap argument, when provided, must be a function');

		const factory = container => container.createInstance(typeOrFactory);

		if (exposeAs) {
			Object.defineProperty(this, exposeAs, {
				get: function () {
					return this.instances[exposeAs] || (this.instances[exposeAs] = exposeMap ? exposeMap(factory(this)) : factory(this));
				}
			});

			this.factories.push(container => container[exposeAs]);
		} else {
			factory.unexposed = true;
			this.factories.push(factory);
		}
	}

	createUnexposedInstances() {
		debug('creating unexposed instances...');
		for (let i = 0; i < this.factories.length; i++) {
			if (this.factories[i].unexposed) {
				this.factories.splice(i, 1)[0](this);
				i--;
			}
		}
	}

	createAllInstances() {
		debug('creating all instances...');
		while (this.factories.length) {
			this.factories.splice(0, 1)[0](this);
		}
	}

	createInstance(typeOrFactory, additionalOptions) {
		debug(`creating ${typeOrFactory.name || 'unnamed'} instance...`);

		return createInstance(typeOrFactory, this, additionalOptions);
	}
};

module.exports.getClassDependencyNames = getClassDependencyNames;
