namespace NodeCqrs {

	/** Base class for Aggregate definition */
	declare abstract class AbstractAggregate implements IAggregate {

		/**
		 * Optional list of commands handled by Aggregate.
		 * Can be overridden in the aggregate implementation
		 */
		static readonly handles: Array<string>;

		/** Aggregate ID */
		readonly id: string | number;

		/** Aggregate Version */
		readonly version: number;

		/** Aggregate Snapshot Version */
		readonly snapshotVersion: number | undefined;

		/** Events emitted by Aggregate */
		readonly changes: IEventStream;

		/** Override to define whether an aggregate state snapshot should be taken */
		readonly shouldTakeSnapshot: boolean;

		state;

		command;

		/** Creates an instance of AbstractAggregate. */
		constructor(options: TAggregateConstructorParams): void;

		/** Pass command to command handler */
		handle(command: ICommand): any;

		/** Mutate aggregate state and increment aggregate version */
		protected mutate(event: IEvent): void;

		/** Format and register aggregate event and mutate aggregate state */
		protected emit(type: string, payload?: object): void;

		/**
		 * Format event based on a current aggregate state
		 * and a command being executed
		 */
		protected makeEvent(type: string, payload?: any, sourceCommand?: ICommand): IEvent;

		/** Register aggregate event and mutate aggregate state */
		protected emitRaw(event: IEvent): void;

		/** Take an aggregate state snapshot and add it to the changes queue */
		takeSnapshot(): void;

		/** Create an aggregate state snapshot */
		protected makeSnapshot(): object;

		/** Restore aggregate state from a snapshot */
		protected restoreSnapshot(snapshotEvent: IEvent): void;

		/** Get human-readable aggregate identifier */
		toString(): string;
	}
}
