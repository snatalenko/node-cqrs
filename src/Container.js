'use strict';

const RX_CONSTRUCTOR = /constructor.?\(([^\)]*)\).?\{([^}]*)\}/;

function getClassDependencyNames(type) {
	if (!type) throw new TypeError('type argument required');
	if (!type.prototype) throw new TypeError('type argument must be a Class');

	const classBody = type.toString();
	const match = classBody.match(RX_CONSTRUCTOR);
	if (!match) throw new Error('constructor could not be found');

	const parameters = match[1].split(',').map(n => n.trim()).filter(n => n);

	return parameters.map(parameterName => {

		if (parameterName === 'options') {

			const ctorBody = match[2];
			const rxOptions = /options\.([\w]+)/g;
			const options = [];

			let pm;
			while (pm = rxOptions.exec(ctorBody)) {
				const optionName = pm[1];
				if (options.indexOf(optionName) === -1)
					options.push(optionName);
			}

			return options;

		} else {
			return parameterName;
		}
	});
}

function createInstance(typeOrFactory, container) {
	if (typeof typeOrFactory !== 'function') throw new TypeError('typeOrFactory argument must be a Function');
	if (!container) throw new TypeError('container argument required');

	if (typeOrFactory.prototype) {

		const dependencies = getClassDependencyNames(typeOrFactory);

		const parameters = dependencies.map(dependency => {
			if (typeof dependency === 'string') {
				return container[dependency];
			} else if (Array.isArray(dependency)) {
				const options = {};
				dependency.forEach(key => options[key] = container[key]);
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
			this.factories.push(factory);
		}
	}

	createAllInstances() {
		while (this._factories.length) {
			this._factories.splice(0, 1)[0](this);
		}
	}

	createInstance(typeOrFactory) {
		return createInstance(typeOrFactory, this);
	}
};
