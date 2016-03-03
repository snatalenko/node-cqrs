'use strict';

const getHandler = require('./utils/getHandler');
const debug = require('./utils/debug');
const _subscribedTo = Symbol('subscribedTo');

function executeSafely(handler, context, errorHandler) {
	return function ( /* ...args */ ) {
		const args = Array.from(arguments);
		try {
			const result = handler.apply(context, args);
			if (result instanceof Promise)
				return result.catch(errorHandler);
			else
				return result;
		} catch (err) {
			return errorHandler(err);
		}
	};
}

module.exports = class Observer {

	// can be overridden to return a list of handler message types
	static get handles() {
		return null;
	}

	constructor() {
		this.debug = debug(this);
	}

	/**
	 * Subscribes to events or commands emitted by observable instance
	 * @param  {Object}	observable
	 * @param  {Array}	messageTypes 	a list of messages this observer listens to (OPTIONAL, if provided during instantination)
	 * @param  {String} masterHandler 	a master handler method or method name to execute for all messages (OPTIONAL, if provided during instantination)
	 * @return {undefined}
	 */
	subscribe(observable, messageTypes, masterHandler) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (!messageTypes) messageTypes = this.handles || Object.getPrototypeOf(this).constructor.handles;
		if (!Array.isArray(messageTypes)) throw new TypeError('messageTypes argument must be an Array');
		if (masterHandler) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
		}

		messageTypes.forEach(messageType => {
			const handler = masterHandler || getHandler(this, messageType);
			if (!handler)
				throw new Error(`'${messageType}' handler is not defined or not a function`);

			this.listenTo(observable, messageType, handler);
		});
	}

	listenTo(observable, messageType, handler) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty string');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		observable.on(messageType, executeSafely(handler, this, err => {
			this.debug(`'${messageType}' processing has failed`);
			this.debug(err);
			throw err;
		}));

		this.debug('listens to \'%s\'', messageType);
	}

	// debug( /* ...arguments */ ) {
	// 	// console.log(...arguments);
	// }
};
