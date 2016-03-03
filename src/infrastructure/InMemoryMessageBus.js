'use strict';

const debug = require('debug')('cqrs:InMemoryBus');

function passToHandler(handler, messageType, payload) {
	return new Promise(function (resolve, reject) {
		debug(`executing '${messageType}' handler...`);
		resolve(handler(payload));
	}).then(result => {
		debug(`'${messageType}' handler execution complete`);
		return result;
	}).catch(err => {
		debug(`'${messageType}' handler execution failed`);
		debug(err);
		throw err;
	});
}

/**
 * Default implementation of the message bus.
 * Keeps all subscriptions and messages in memory.
 * Delivers synchronously, events - asynchronously.
 * @type {[type]}
 */
module.exports = class InMemoryMessageBus {

	constructor() {
		this._handlers = {};
	}

	on(messageType, handler, context) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		const handlers = this._handlers[messageType] || (this._handlers[messageType] = []);

		handlers.push(context ? handler.bind(context) : handler);
	}

	off(messageType, handler) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');
		if (!this._handlers[messageType]) throw new Error(`No ${messageType} subscribers found`);

		const index = this._handlers[messageType].indexOf(handler);
		if (index !== -1) {
			this._handlers[messageType].splice(index, 1);
		}
	}

	send(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		const commandType = command.type;
		if (typeof commandType !== 'string' || !commandType.length) throw new TypeError('commandType argument must be a non-empty String');

		const handlers = this._handlers[commandType];
		if (!handlers || !handlers.length) throw new Error(`No '${commandType}' subscribers found`);
		if (handlers.length > 1) throw new Error(`More than one '${commandType}' subscriber found`);

		return passToHandler(handlers[0], commandType, command);
	}

	publish(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const eventType = event.type;
		if (typeof eventType !== 'string' || !eventType.length) throw new TypeError('eventType argument must be a non-empty String');

		const handlers = this._handlers[eventType] || [];
		if (!handlers || !handlers.length) {
			debug(`no '${eventType}' handlers defined, message ignored`);
			return Promise.resolve([]);
		}

		return Promise.all(handlers.map(handler => passToHandler(handler, eventType, event)));
	}
};
