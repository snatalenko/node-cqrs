'use strict';

const { attachLogMethods, subscribe } = require('./utils');

/**
 * @class Observer
 * @implements {IObserver}
 */
module.exports = class Observer {

	/**
	 * Returns an array of handled message types. Should be overridden
	 *
	 * @returns {string[]} - handled message types (e.g. ['somethingHappened'])
	 * @static
	 * @readonly
	 */
	static get handles() {
		return null;
	}

	/**
	 * Subscribe observer to observable
	 *
	 * @static
	 * @param {IObservable} observable
	 * @param {IObserver} observer
	 * @param {object} options
	 * @returns
	 */
	static subscribe(observable, observer, options) {
		return subscribe(observable, observer, options);
	}

	/**
	 * Creates an instance of Observer
	 */
	constructor() {
		attachLogMethods(this);
	}

	/**
	 * Subscribes to events or commands emitted by observable instance
	 *
	 * @param  {IObservable} observable
	 * @param  {string[]} [messageTypes] a list of messages this observer listens to
	 * @param  {string|IMessageHandler} [masterHandler] a master handler method or method name to execute for all messages
	 */
	subscribe(observable, messageTypes, masterHandler) {
		return subscribe(observable, this, { messageTypes, masterHandler });
	}
};
