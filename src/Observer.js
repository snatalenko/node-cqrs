'use strict';

const validate = require('./validate');
const debug = function () {};
const logError = function () {};

class Observer {

	/**
	 * Observer constructor
	 * @param  {Array}	messageTypes	a list of messages this observer listens to (OPTIONAL)
	 * @param  {String}	masterHandler	master handler method or method name to execute for all events. if not specified, message-specific handlers will be executed (OPTIONAL)
	 */
	constructor(messageTypes, masterHandler) {
		if (messageTypes) {
			validate.array(messageTypes, 'messageTypes');
			this._messageTypes = messageTypes;
		}
		if (masterHandler) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
			this._masterHandler = masterHandler;
		}
		this.debug = debug;
	}

	error( /* errorMessage */ ) {
		if (this.debug === debug) {
			console.log.apply(console, arguments);
		}
		else {
			this.debug.apply(this, arguments);
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
		validate.object(observable, 'observable');
		validate.array(messageTypes || (messageTypes = this._messageTypes), 'messageTypes');

		if (masterHandler || (masterHandler = this._masterHandler)) {
			if (typeof masterHandler === 'string') masterHandler = this[masterHandler];
			if (typeof masterHandler !== 'function') throw new TypeError('masterHandler argument, when provided, must be either a function or an observer method name');
		}

		for (const messageType of messageTypes) {
			const handler = masterHandler || this['_' + messageType];
			if (typeof handler !== 'function') throw new Error(messageType + ' handler is not defined or not a function');

			this.listenTo(messageType, observable, handler);
		}
	}

	listenTo(messageType, observable, handler) {
		validate.string(messageType, 'messageType');
		validate.object(observable, 'observable');
		validate.func(observable.on, 'observable.on');
		validate.func(handler, 'handler');

		observable.on(messageType, this._proxy(messageType, handler));

		this.debug('listens to \'%s\'', messageType);
	}

	/**
	 * This wrapper catches and logs errors, if any arise during the message handler execution
	 * @param  {String} messageType
	 * @param  {Function} messageHandler
	 */
	_proxy(messageType, messageHandler) {
		validate.string(messageType, 'messageType');
		validate.func(messageHandler, 'messageHandler');

		return function () {
			try {
				const handlerResult = messageHandler.apply(this, arguments);
				if (handlerResult instanceof Promise) {
					// wait for result and catch error
					return handlerResult.catch(this._onExecutionFailed.bind(this, messageType));
				}
				return handlerResult;
			}
			catch (err) {
				this._onExecutionFailed(messageType, err);
			}
		}.bind(this);
	}

	_onExecutionFailed(messageType, err) {
		this.error(messageType + ' execution failed:', err);
		throw err;
	}
}

module.exports = Observer;
