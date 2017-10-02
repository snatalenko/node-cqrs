'use strict';

const { attachLogMethods, subscribe } = require('./utils');

/**
 * Observable type
 * @typedef {{ on:(type: string, handler: (message) => void) => void }} IObservable
 */

/**
 * Observer type
 * @typedef {object} IObserver
 */

module.exports = class Observer {

	/**
	 * Returns an array of handled message types. Should be overridden
	 *
	 * @returns {string[]} - handled message types (e.g. ['somethingHappened', 'anotherHappened'])
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
	 * @param {{ handles: string[], masterHandler: string|function, queueName: string }}
	 * @returns
	 */
	static subscribe(...args) {
		return subscribe(...args);
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
	 * @param  {Object} observable
	 * @param  {Array} [messageTypes] a list of messages this observer listens to
	 * @param  {String} [masterHandler] a master handler method or method name to execute for all messages
	 * @returns {Promise<any[]>}
	 */
	subscribe(observable, messageTypes, masterHandler) {
		return subscribe(observable, this, { messageTypes, masterHandler });
	}
};
