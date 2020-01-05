/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
declare interface IAggregate {
	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** List of events emitted by Aggregate as a result of handling command(s) */
	readonly changes: IEventStream;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Make a snapshot event and append it to `changes` */
	takeSnapshot?(): void;
}

declare type TAggregateConstructorParams = {
	id: Identifier,
	events?: IEventStream,
	state?: any
};

declare interface IAggregateConstructor {
	new(options: TAggregateConstructorParams): IAggregate;
	readonly handles?: string[];
}

declare type IAggregateFactory = (options: TAggregateConstructorParams) => IAggregate;

