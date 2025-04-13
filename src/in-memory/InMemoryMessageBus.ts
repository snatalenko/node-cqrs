import {
	DispatchPipelineBatch,
	ICommand,
	IDispatchPipelineProcessor,
	IEvent,
	IMessageBus,
	IMessageHandler,
	IObservable
} from '../interfaces';

/**
 * Default implementation of the message bus.
 * Keeps all subscriptions and messages in memory.
 */
export class InMemoryMessageBus implements IMessageBus, IDispatchPipelineProcessor {

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
		if (typeof messageType !== 'string' || !messageType.length)
			throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');
		if (arguments.length !== 2)
			throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);

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
		if (typeof messageType !== 'string' || !messageType.length)
			throw new TypeError('messageType argument must be a non-empty String');
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');
		if (arguments.length !== 2)
			throw new TypeError(`2 arguments are expected, but ${arguments.length} received`);
		if (!this.handlers.has(messageType))
			throw new Error(`No ${messageType} subscribers found`);

		this.handlers.get(messageType)?.delete(handler);
	}

	/**
	 * Send command to exactly 1 command handler
	 */
	async send(command: ICommand): Promise<any> {
		if (typeof command !== 'object' || !command)
			throw new TypeError('command argument must be an Object');
		if (typeof command.type !== 'string' || !command.type.length)
			throw new TypeError('command.type argument must be a non-empty String');

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
	async publish(event: IEvent, meta?: Record<string, any>): Promise<any> {
		if (typeof event !== 'object' || !event)
			throw new TypeError('event argument must be an Object');
		if (typeof event.type !== 'string' || !event.type.length)
			throw new TypeError('event.type argument must be a non-empty String');

		const handlers = [
			...this.handlers.get(event.type) || [],
			...Array.from(this.queues.values()).map(namedQueue =>
				(e: IEvent, m?: Record<string, any>) => namedQueue.publish(e, m))
		];

		return Promise.all(handlers.map(handler => handler(event, meta)));
	}

	/**
	 * Processes a batch of events and publishes them to the fanout exchange.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		for (const { event, origin } of batch) {
			// Skip publishing if the event was dispatched from external source
			if (origin === 'external')
				continue;

			if (!event)
				throw new Error('Event batch does not contain `event`');

			await this.publish(event);
		}

		return batch;
	}
}
