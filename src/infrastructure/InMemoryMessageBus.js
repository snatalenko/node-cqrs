'use strict';

/**
 * Default implementation of the message bus. Keeps all subscriptions and messages in memory.
 *
 * @class InMemoryMessageBus
 * @implements {IMessageBus}
 */
class InMemoryMessageBus {

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
	 * @param {object} [options]
	 * @param {string} [options.name]
	 * @param {boolean} [options.uniqueEventHandlers]
	 */
	constructor({ name, uniqueEventHandlers = !!name } = {}) {
		/** @type {Map<string, Set<IMessageHandler>>} */
		this._handlers = new Map();

		this._name = name;
		this._uniqueEventHandlers = uniqueEventHandlers;

		/** @type {Map<string, InMemoryMessageBus>} */
		this._queues = new Map();
	}

	/**
	 * Subscribe to message type
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 */
	on(messageType, handler) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');
		if (arguments.length !== 2) throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);

		// Events published to a named queue must be consumed only once.
		// For example, for sending a welcome email, NotificationReceptor will subscribe to "notifications:userCreated".
		// Since we use an in-memory bus, there is no need to track message handling by multiple distributed subscribers,
		// and we only need to make sure that no more than 1 such subscriber will be created
		if (!this._handlers.has(messageType))
			this._handlers.set(messageType, new Set());
		else if (this._uniqueEventHandlers)
			throw new Error(`"${messageType}" handler is already set up on the "${this._name}" queue`);

		this._handlers.get(messageType).add(handler);
	}

	/**
	 * Get or create a named queue.
	 * Named queues support only one handler per event type.
	 *
	 * @param {string} name
	 * @returns {IObservable}
	 */
	queue(name) {
		if (!this._queues.has(name))
			this._queues.set(name, new InMemoryMessageBus({ name, uniqueEventHandlers: true }));

		return this._queues.get(name);
	}

	/**
	 * Remove subscription
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 */
	off(messageType, handler) {
		if (typeof messageType !== 'string' || !messageType.length) throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');
		if (arguments.length !== 2) throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);
		if (!this._handlers.has(messageType)) throw new Error(`No ${messageType} subscribers found`);

		this._handlers.get(messageType).delete(handler);
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

		const handlers = [
			...this._handlers.get(event.type) || [],
			...Array.from(this._queues.values()).map(namedQueue =>
				e => namedQueue.publish(e))
		];

		return Promise.all(handlers.map(handler => handler(event)));
	}
}

module.exports = InMemoryMessageBus;
