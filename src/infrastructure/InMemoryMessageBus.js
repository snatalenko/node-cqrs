'use strict';

const info = require('debug')('cqrs:info:InMemoryMessageBus');

/**
 * Default implementation of the message bus. Keeps all subscriptions and messages in memory.
 *
 * @class {InMemoryMessageBus}
 * @implements {IMessageBus}
 */
module.exports = class InMemoryMessageBus {

	/**
	 * Indicates that message bus supports named queue subscriptions
	 *
	 * @type {boolean}
	 * @readonly
	 * @static
	 */
	static get supportsQueues() {
		return true;
	}

	/**
	 * Creates an instance of InMemoryMessageBus
	 */
	constructor() {
		/** @type {Map<string, Set<IMessageHandler>>} */
		this._handlers = new Map();

		/** @type {Set<string>} */
		this._namedSubscriptions = new Set();
	}

	/**
	 * Subscribe to message type
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 * @param {object} [options]
	 * @param {string} [options.queueName]
	 */
	on(messageType, handler, options) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		if (options && options.queueName) {
			// Events published to a named queue must be consumed only once.
			// For example, for sending a welcome email, NotificationReceptor will subscribe to "notifications:userCreated".
			// Since we use an in-memory bus, there is no need to track message handling by multiple distributed subscribers,
			// and we only need to make sure that no more than 1 such subscriber will be created
			const handlerKey = `${options.queueName}:${messageType}`;
			if (this._namedSubscriptions.has(handlerKey))
				throw new Error(`'${handlerKey}' handler already set up on this node`);

			this._namedSubscriptions.add(handlerKey);
		}

		if (!this._handlers.has(messageType))
			this._handlers.set(messageType, new Set());

		this._handlers.get(messageType).add(handler);
	}

	/**
	 * Remove subscription
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 * @param {object} [options]
	 * @param {string} [options.queueName]
	 */
	off(messageType, handler, options) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');
		if (!this._handlers.has(messageType)) throw new Error(`No ${messageType} subscribers found`);

		this._handlers.get(messageType).delete(handler);

		if (options && options.queueName)
			this._namedSubscriptions.delete(`${options.queueName}:${messageType}`);
	}

	/**
	 * Send command to exactly 1 command handler
	 *
	 * @param {ICommand} command
	 * @returns {Promise<any>}
	 */
	async send(command) {
		if (typeof command !== 'object' || !command) throw new TypeError('command argument must be an Object');
		if (typeof command.type !== 'string' || !command.type.length) throw new TypeError('command.type argument must be a non-empty String');

		const handlers = this._handlers.get(command.type);
		if (!handlers || !handlers.size)
			throw new Error(`No '${command.type}' subscribers found`);
		if (handlers.size > 1)
			throw new Error(`More than one '${command.type}' subscriber found`);

		const commandHandler = handlers.values().next().value;

		return commandHandler(command);
	}

	/**
	 * Publish event to all subscribers (if any)
	 *
	 * @param {IEvent} event
	 * @returns {Promise<any>}
	 */
	async publish(event) {
		if (typeof event !== 'object' || !event) throw new TypeError('event argument must be an Object');
		if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type argument must be a non-empty String');

		const handlers = this._handlers.get(event.type);
		if (!handlers || !handlers.size) {
			info('no "%s" handlers defined, message ignored', event.type);
			return undefined;
		}

		return Promise.all(Array.from(handlers.values()).map(handler => handler(event)));
	}
};
