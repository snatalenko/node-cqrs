import type { IEvent } from './IEvent.ts';
import type { IEventSet } from './IEventSet.ts';
import type { ICommand } from './ICommand.ts';
import type { Identifier } from './Identifier.ts';

export interface ISaga {

	/**
	 * Apply a historical event to restore saga state.
	 */
	mutate(event: IEvent): unknown | Promise<unknown>;

	/**
	 * Process an incoming event and return produced commands.
	 */
	handle(event: IEvent): ReadonlyArray<ICommand> | Promise<ReadonlyArray<ICommand>>;
}

export type ISagaConstructorParams = {
	id: Identifier,

	/** @deprecated Past events will be passed to the `mutate` method */
	events?: IEventSet
};

export type ISagaFactory = (options: ISagaConstructorParams) => ISaga;

export interface ISagaConstructor {
	new(options: ISagaConstructorParams): ISaga;

	/**
	 * Override to provide a stable saga descriptor used as a key in `message.sagaOrigins`.
	 * Defaults to the Saga class name.
	 */
	readonly sagaDescriptor?: string;

	/** List of event types that trigger new saga start */
	readonly startsWith: string[];

	/** List of events being handled by Saga */
	readonly handles: string[];
}
