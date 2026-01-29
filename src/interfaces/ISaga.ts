import type { ICommand } from './ICommand.ts';
import type { Identifier } from './Identifier.ts';
import type { IEvent } from './IEvent.ts';
import type { IEventSet } from './IEventSet.ts';

export interface ISaga {

	/** Unique Saga ID */
	readonly id: Identifier;

	/** List of commands emitted by Saga */
	readonly uncommittedMessages: ICommand[];

	/** Main entry point for Saga events */
	apply(event: IEvent): void | Promise<void>;

	/** Reset emitted commands when they are not longer needed */
	resetUncommittedMessages(): void;

	onError?(error: Error, options: { event: IEvent, command: ICommand }): void;
}

export type ISagaConstructorParams = {
	id: Identifier,
	events?: IEventSet
};

export type ISagaFactory = (options: ISagaConstructorParams) => ISaga;

export interface ISagaConstructor {
	new(options: ISagaConstructorParams): ISaga;

	/** List of event types that trigger new saga start */
	readonly startsWith: string[];

	/** List of events being handled by Saga */
	readonly handles: string[];
}
