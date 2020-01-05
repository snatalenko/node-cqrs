/** Base class for Saga definition */
declare abstract class AbstractSaga implements ISaga {

	/** List of events that start new saga, must be overridden in Saga implementation */
	static readonly startsWith: Array<string>;

	/** List of event types being handled by Saga, must be overridden in Saga implementation */
	static readonly handles: Array<string>;

	/** Saga ID */
	readonly id: string | number;

	/** Saga version */
	readonly version: number;

	/** Command execution queue */
	readonly uncommittedMessages: Array<ICommand>;

	/** Creates an instance of AbstractSaga */
	constructor(options: TSagaParams): AbstractSaga;

	/** Modify saga state by applying an event */
	apply(event: IEvent): void | Promise<void>;

	/** Format a command and put it to the execution queue */
	protected enqueue(commandType: string, aggregateId: string | number, payload: object): void;

	/** Put a command to the execution queue */
	protected enqueueRaw(command: ICommand): void;

	/** Clear the execution queue */
	resetUncommittedMessages(): void;

	/** Get human-readable Saga name */
	toString(): string;
}
