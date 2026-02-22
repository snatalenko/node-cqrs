import type {
	ICommand,
	IEvent,
	IMessageBus,
	IMessageHandler,
	IObservable,
	IObservableQueueProvider
} from '../interfaces/index.ts';
import {
	assertEvent,
	assertFunction,
	assertMessage,
	assertString
} from '../utils/assert.ts';

/**
 * Default implementation of the message bus.
 * Keeps all subscriptions and messages in memory.
 */
export class InMemoryMessageBus implements IMessageBus, IObservableQueueProvider {

	protected handlers: Map<string, Set<IMessageHandler>> = new Map();
	protected uniqueEventHandlers: boolean;
	protected queueName: string | undefined;
	protected queues: Map<string, IMessageBus> = new Map();

	constructor({ queueName, uniqueEventHandlers = !!queueName }: {
		queueName?: string,
		uniqueEventHandlers?: boolean
	} = {}) {
		this.queueName = queueName;
		this.uniqueEventHandlers = uniqueEventHandlers;
	}

	/**
	 * Subscribe to message type
	 */
	on(messageType: string, handler: IMessageHandler) {
		assertString(messageType, 'messageType');
		assertFunction(handler, 'handler');

		// Events published to a named queue must be consumed only once.
		// For example, for sending a welcome email, NotificationReceptor will subscribe to "notifications:userCreated".
		// Since we use an in-memory bus, there is no need to track message handling by multiple distributed
		// subscribers, and we only need to make sure that no more than 1 such subscriber will be created
		if (!this.handlers.has(messageType))
			this.handlers.set(messageType, new Set());
		else if (this.uniqueEventHandlers)
			throw new Error(`"${messageType}" handler is already set up on the "${this.queueName}" queue`);

		this.handlers.get(messageType)?.add(handler);
	}

	/**
	 * Get or create a named queue.
	 * Named queues support only one handler per event type.
	 */
	queue(queueName: string): IObservable {
		let queue = this.queues.get(queueName);
		if (!queue) {
			queue = new InMemoryMessageBus({ queueName, uniqueEventHandlers: true });
			this.queues.set(queueName, queue);
		}

		return queue;
	}

	/**
	 * Remove subscription
	 */
	off(messageType: string, handler: IMessageHandler) {
		assertString(messageType, 'messageType');
		assertFunction(handler, 'handler');
		if (!this.handlers.has(messageType))
			throw new Error(`No ${messageType} subscribers found`);

		this.handlers.get(messageType)?.delete(handler);
	}

	/**
	 * Send command to exactly 1 command handler
	 */
	async send(command: ICommand): Promise<any> {
		assertMessage(command, 'command');

		const handlers = this.handlers.get(command.type);
		if (!handlers || !handlers.size)
			throw new Error(`No '${command.type}' subscribers found`);
		if (handlers.size > 1)
			throw new Error(`More than one '${command.type}' subscriber found`);

		const commandHandler = handlers.values().next().value;

		return commandHandler!(command);
	}

	/**
	 * Publish event to all subscribers (if any)
	 */
	async publish(event: IEvent, meta?: Record<string, any>): Promise<unknown[]> {
		assertEvent(event, 'event');

		const promises: (unknown | Promise<unknown>)[] = [];

		for (const handler of this.handlers.get(event.type) ?? [])
			promises.push(handler(event, meta));

		for (const namedQueue of this.queues.values())
			promises.push(namedQueue.publish(event, meta));

		return Promise.all(promises);
	}
}
