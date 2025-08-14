import { ICommand } from './ICommand';
import { Identifier } from './Identifier';
import { IEvent } from './IEvent';
import { IEventSet } from './IEventSet';

/**
 * Core interface representing an Aggregate in a CQRS architecture.
 * An aggregate encapsulates business logic and state, handling commands
 * and applying events to transition between states.
 */
export interface IAggregate {

	/**
	 * Applies a single event to update the aggregate's internal state.
	 *
	 * This method is used primarily when rehydrating the aggregate
	 * from the persisted sequence of events
	 *
	 * @param event - The event to be applied
	 */
	mutate(event: IEvent): void;

	/**
	 * Processes a command by executing the aggregate's business logic,
	 * resulting in new events that capture the state changes.
	 * It serves as the primary entry point for invoking aggregate behavior
	 *
	 * @param command - The command to be processed
	 * @returns A set of events produced by the command
	 */
	handle(command: ICommand): IEventSet | Promise<IEventSet>;
}

export interface IMutableAggregateState {

	/**
	 * Apply a single event to mutate the aggregate's state.
	 */
	mutate(event: IEvent): void;
}

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
