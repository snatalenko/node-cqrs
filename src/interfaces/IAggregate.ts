import { ICommand } from './ICommand';
import { Identifier } from './Identifier';
import { IEvent } from './IEvent';
import { IEventSet } from './IEventSet';

/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
export interface IAggregate {

	/** Unique aggregate identifier */
	readonly id: Identifier;

	/** Update aggregate state with event */
	mutate(event: IEvent): void;

	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** Get events emitted during command(s) handling and reset the `changes` collection */
	popChanges(): IEventSet;

	/**
	 * List of events emitted by Aggregate as a result of handling command(s)
	 * @deprecated use `popChanges()` instead
	 */
	readonly changes: IEventSet;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Take an aggregate state snapshot and add it to the changes queue */
	takeSnapshot?(): void;
}

export interface IMutableAggregateState {

	// schemaVersion?: number;
	// constructor: IAggregateStateConstructor;
	mutate(event: IEvent): void;
}

// export interface IAggregateStateConstructor extends Function {
// 	schemaVersion?: number;
// 	new(): IAggregateState;
// }

export type IAggregateConstructorParams<TState extends IMutableAggregateState | object | void> = {

	/** Unique aggregate identifier */
	id: Identifier,

	/**
	 * @deprecated The aggregate no longer receives all events in the constructor.
	 *   Instead, events are loaded and passed to the `mutate` method after instantiation.
	 */
	events?: IEventSet,

	/** Aggregate state instance */
	state?: TState
};

export interface IAggregateConstructor<
	TAggregate extends IAggregate,
	TState extends IMutableAggregateState | object | void
> {
	readonly handles: string[];
	new(options: IAggregateConstructorParams<TState>): TAggregate;
}

export type IAggregateFactory<
	TAggregate extends IAggregate,
	TState extends IMutableAggregateState | object | void
> = (options: IAggregateConstructorParams<TState>) => TAggregate;
