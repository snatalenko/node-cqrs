import { ICommand } from "./ICommand";
import { Identifier } from "./Identifier";
import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";

/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
export interface IAggregate {

	/** Unique aggregate identifier */
	readonly id: Identifier;

	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** List of events emitted by Aggregate as a result of handling command(s) */
	readonly changes: IEventSet;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Take an aggregate state snapshot and add it to the changes queue */
	takeSnapshot(): void;
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

	/** Aggregate events, logged after latest snapshot */
	events?: IEventSet,

	/** Aggregate state instance */
	state?: TState
};

export interface IAggregateConstructor<TState extends IMutableAggregateState | object | void> {
	readonly handles?: string[];
	new(options: IAggregateConstructorParams<TState>): IAggregate;
}

export type IAggregateFactory<TState extends IMutableAggregateState | object | void> =
	(options: IAggregateConstructorParams<TState>) => IAggregate;

