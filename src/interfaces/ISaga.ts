import { ICommand } from "./ICommand";
import { IEvent } from "./IEvent";
import { IEventSet } from "./IEventSet";

export interface ISaga {
	/** Unique Saga ID */
	readonly id: string;

	/** List of commands emitted by Saga */
	readonly uncommittedMessages: ICommand[];

	/** Main entry point for Saga events */
	apply(event: IEvent): void | Promise<void>;

	/** Reset emitted commands when they are not longer needed */
	resetUncommittedMessages(): void;

	onError?(error: Error, options: { event: IEvent, command: ICommand }): void;
}

export type ISagaConstructorParams = {
	id: string,
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
