namespace NodeCqrs {

	declare class CommandBus implements ICommandBus {

		/** Creates an instance of CommandBus. */
		constructor(options?: { messageBus?: IMessageBus, logger?: ILogger }): void;

		/** Set up a command handler */
		on(commandType: string, handler: IMessageHandler): any;

		/** Format and send a command for execution */
		send(type: string, aggregateId: string, options: Object, otherArgs: object): Promise<IEventStream>;

		/** Send a command for execution */
		sendRaw(command: ICommand): Promise<IEventStream>;
	}
}
