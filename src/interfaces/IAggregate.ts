import { ICommand } from './ICommand';
import { Identifier } from './Identifier';
import { IEvent } from './IEvent';
import { IEventSet } from './IEventSet';

/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
export interface IAggregate {

	/**
	 * Apply a single event to mutate the aggregate's state.
	 *
	 * Used by `AggregateCommandHandler` when restoring the aggregate state from the event store.
	 */
	mutate(event: IEvent): void;

	/**
	 * Process a command sent to the aggregate.
	 *
	 * This is the main entry point for handling aggregate commands.
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
