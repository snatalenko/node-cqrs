namespace NodeCqrs {

	/**
	 * Aggregate command handler.
	 * 
	 * Subscribes to event store and awaits aggregate commands.
	 * Upon command receiving creates an instance of aggregate,
	 * restores its state, passes command and commits emitted events to event store.
	 */
	declare class AggregateCommandHandler implements ICommandHandler {

		/** Creates an instance of AggregateCommandHandler. */
		constructor(options: { eventStore: IEventStore, aggregateType: IAggregateConstructor | IAggregateFactory, handles?: Array<string>, logger?: ILogger }): void;

		/** Subscribe to all command types handled by aggregateType */
		subscribe(commandBus: ICommandBus): any;

		/** Pass a command to corresponding aggregate */
		execute(cmd: ICommand): Promise<IEventStream>;
	}
}
