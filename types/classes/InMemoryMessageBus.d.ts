namespace NodeCqrs {

	/** Default implementation of the message bus. Keeps all subscriptions and messages in memory. */
	declare class InMemoryMessageBus implements IMessageBus {

		/** Indicates that message bus supports named queue subscriptions */
		static readonly supportsQueues: boolean;

		/** Creates an instance of InMemoryMessageBus */
		constructor(options?: { name?: string, uniqueEventHandlers?: boolean }): void;

		/** Subscribe to message type */
		on(messageType: string, handler: IMessageHandler): void;

		/**
		 * Get or create a named queue.
		 * Named queues support only one handler per event type.
		 */
		queue(name: string): IObservable;

		/** Remove subscription */
		off(messageType: string, handler: IMessageHandler): void;

		/** Send command to exactly 1 command handler */
		send(command: ICommand): Promise<any>;

		/** Publish event to all subscribers (if any) */
		publish(event: IEvent): Promise<any>;
	}
}
