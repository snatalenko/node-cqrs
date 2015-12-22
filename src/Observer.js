'use strict';

function executeSafely(handler, context, errorHandler) {
	return function ( /* ...args */ ) {
		const args = Array.from(arguments);
		try {
			const result = handler.apply(context, args);
			if (result instanceof Promise)
				return result.catch(errorHandler);
			else
				return result;
		}
		catch (err) {
			return errorHandler(err);
		}
	};
}

class Observer {

	/**
	 * Observer constructor, optionally allows to define define observable message types and(or) master handler
	 * @param  {Array}	messageTypes	a list of messages this observer listens to (OPTIONAL)
	 * @param  {String}	masterHandler	master handler method or method name to execute for all events. if not specified, message-specific handlers will be executed (OPTIONAL)
	 */
	constructor(messageTypes, masterHandler) {
		if (messageTypes) {
			if (!Array.isArray(messageTypes)) throw new TypeError('messageTypes argument, when provided, must be an Array');
			this._messageTypes = messageTypes;
		}
		if (masterHandler) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
			this._masterHandler = masterHandler;
		}
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
		if (!messageTypes) messageTypes = this._messageTypes;
		if (!Array.isArray(messageTypes)) throw new TypeError('messageTypes argument must be an Array');

		if (masterHandler || (masterHandler = this._masterHandler)) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
		}

		for (const messageType of messageTypes) {
			const handler = masterHandler || this['_' + messageType];
			if (typeof handler !== 'function') throw new Error(messageType + ' handler is not defined or not a function');

			this.listenTo(observable, messageType, handler);
		}
	}

	listenTo(observable, messageType, handler) {
		if (typeof observable !== 'object' || !observable) throw new TypeError('observable argument must be an Object');
		if (typeof observable.on !== 'function') throw new TypeError('observable.on must be a Function');
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty string');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		observable.on(messageType, executeSafely(handler, this, err => {
			this.debug('command \'' + messageType + '\' execution has failed:\n' + err.stack);
			throw err;
		}));

		this.debug('listens to \'%s\'', messageType);
	}

	debug( /* ...arguments */ ) {
		// console.log(...arguments);
	}
}

module.exports = Observer;
