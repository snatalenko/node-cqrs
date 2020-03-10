/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
declare interface IAggregate {

	/** Unique aggregate identifier */
	readonly id: Identifier;

	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** List of events emitted by Aggregate as a result of handling command(s) */
	readonly changes: IEventStream;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Create aggregate snapshot */
	makeSnapshot?(): TSnapshot;
}

declare type TAggregateConstructorParams = {
	/** Unique aggregate identifier */
	id: Identifier,

	/** Aggregate state snapshot, if any */
	snapshot?: TSnapshot,

	/** Aggregate events, logged after latest snapshot */
	events?: IEventStream,

	/** Aggregate state instance */
	state?: any
};

declare interface IAggregateConstructor {
	new(options: TAggregateConstructorParams): IAggregate;
	readonly handles?: string[];
}

declare type IAggregateFactory = (options: TAggregateConstructorParams) => IAggregate;

