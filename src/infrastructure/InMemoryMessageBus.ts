'use strict';

import { ICommand, IEvent, IMessageBus, IMessageHandler, IObservable } from "../interfaces";

/**
 * Default implementation of the message bus.
 * Keeps all subscriptions and messages in memory.
 */
export default class InMemoryMessageBus implements IMessageBus {

	_handlers: Map<string, Set<IMessageHandler>> = new Map();
	_name: string | undefined;
	_uniqueEventHandlers: boolean;
	_queues: Map<string, InMemoryMessageBus> = new Map();

	/**
	 * Creates an instance of InMemoryMessageBus
	 */
	constructor({ name, uniqueEventHandlers = !!name }: {
		name?: string,
		uniqueEventHandlers?: boolean
	} = {}) {
		this._name = name;
		this._uniqueEventHandlers = uniqueEventHandlers;
	}

	/**
	 * Subscribe to message type
	 */
	on(messageType: string, handler: IMessageHandler) {
		/* istanbul ignore if */
		if (typeof messageType !== 'string' || !messageType.length)
			throw new TypeError('messageType argument must be a non-empty String');
		/* istanbul ignore if */
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');
		/* istanbul ignore if */
		if (arguments.length !== 2)
			throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);

		// Events published to a named queue must be consumed only once.
		// For example, for sending a welcome email, NotificationReceptor will subscribe to "notifications:userCreated".
		// Since we use an in-memory bus, there is no need to track message handling by multiple distributed subscribers,
		// and we only need to make sure that no more than 1 such subscriber will be created
		if (!this._handlers.has(messageType))
			this._handlers.set(messageType, new Set());
		else if (this._uniqueEventHandlers)
			throw new Error(`"${messageType}" handler is already set up on the "${this._name}" queue`);

		this._handlers.get(messageType)?.add(handler);
	}

	/**
	 * Get or create a named queue.
	 * Named queues support only one handler per event type.
	 */
	queue(name: string): IObservable {
		let queue = this._queues.get(name);
		if (!queue) {
			queue = new InMemoryMessageBus({ name, uniqueEventHandlers: true });
			this._queues.set(name, queue);
		}

		return queue;
	}

	/**
	 * Remove subscription
	 *
	 * @param {string} messageType
	 * @param {IMessageHandler} handler
	 */
	off(messageType: string, handler: IMessageHandler) {
		/* istanbul ignore if */
		if (typeof messageType !== 'string' || !messageType.length)
			throw new TypeError('messageType argument must be a non-empty String');
		/* istanbul ignore if */
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');
		/* istanbul ignore if */
		if (arguments.length !== 2)
			throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);
		/* istanbul ignore if */
		if (!this._handlers.has(messageType))
			throw new Error(`No ${messageType} subscribers found`);

		this._handlers.get(messageType)?.delete(handler);
	}

	/**
	 * Send command to exactly 1 command handler
	 */
	async send(command: ICommand): Promise<any> {
		/* istanbul ignore if */
		if (typeof command !== 'object' || !command)
			throw new TypeError('command argument must be an Object');
		/* istanbul ignore if */
		if (typeof command.type !== 'string' || !command.type.length)
			throw new TypeError('command.type argument must be a non-empty String');

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
	 */
	async publish(event: IEvent): Promise<any> {
		/* istanbul ignore if */
		if (typeof event !== 'object' || !event)
			throw new TypeError('event argument must be an Object');
		/* istanbul ignore if */
		if (typeof event.type !== 'string' || !event.type.length)
			throw new TypeError('event.type argument must be a non-empty String');

		const handlers = [
			...this._handlers.get(event.type) || [],
			...Array.from(this._queues.values()).map(namedQueue =>
				(e: IEvent) => namedQueue.publish(e))
		];

		return Promise.all(handlers.map(handler => handler(event)));
	}
}
