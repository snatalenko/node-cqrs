import {
	type ICommand,
	type ICommandBus,
	type Identifier,
	type IEvent,
	type IEventStore,
	type IMutableState,
	type ISaga,
	type ISagaConstructor,
	type ISagaConstructorParams,
	isEvent
} from './interfaces/index.ts';
import { SagaEventHandler } from './SagaEventHandler.ts';
import {
	validateHandlers,
	getHandler,
	promiseOrSync,
	getClassName,
	getMessageHandlerNames
} from './utils/index.ts';

/**
 * Base class for Saga definition
 */
export abstract class AbstractSaga implements ISaga {

	/**
	 * Optional list of events that start new saga.
	 *
	 * When not defined, saga start is inferred by the absence of `message.sagaOrigins[sagaDescriptor]`.
	 */
	static get startsWith(): string[] | undefined {
		return undefined;
	}

	/** List of event types being handled by Saga, can be overridden in Saga implementation */
	static get handles(): string[] {
		return getMessageHandlerNames(this);
	}

	/**
	 * Convenience helper to create a `SagaEventHandler` for this saga type and subscribe it to
	 * the provided `eventStore`.
	 */
	static register<T extends AbstractSaga>(
		this: ISagaConstructor & (new (options: ISagaConstructorParams) => T),
		eventStore: IEventStore,
		commandBus: ICommandBus
	): SagaEventHandler {
		const handler = new SagaEventHandler({
			sagaType: this,
			eventStore,
			commandBus
		});
		handler.subscribe(eventStore);
		return handler;
	}

	/** Saga ID */
	get id(): Identifier {
		return this.#id;
	}

	/** Saga version */
	get version(): number {
		return this.#version;
	}

	protected state?: IMutableState | object;

	#id: Identifier;
	#version = 0;
	#messages: ICommand[] = [];
	#handling = false;

	/**
	 * Creates an instance of AbstractSaga
	 */
	constructor(options: ISagaConstructorParams) {
		if (!options)
			throw new TypeError('options argument required');
		if (!options.id)
			throw new TypeError('options.id argument required');
		if (options.events)
			throw new TypeError('options.events argument is deprecated');

		this.#id = options.id;

		validateHandlers(this, 'startsWith');
		validateHandlers(this, 'handles');
	}

	/** Modify saga state by applying an event */
	mutate(event: IEvent): void {
		if (!isEvent(event))
			throw new TypeError('event argument must be a valid IEvent');

		if (this.state) {
			const handler = 'mutate' in this.state ?
				this.state.mutate :
				getHandler(this.state, event.type);
			if (handler)
				handler.call(this.state, event);
		}

		this.#version += 1;
	}

	/** Process saga event and return produced commands */
	handle(event: IEvent): ReadonlyArray<ICommand> | Promise<ReadonlyArray<ICommand>> {
		if (!isEvent(event))
			throw new TypeError('event argument must be a valid IEvent');
		if (this.#handling)
			throw new Error('Another event is being processed, concurrent handling is not allowed');

		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		this.#handling = true;
		this.#messages.length = 0;

		try {
			const r = handler.call(this, event);

			return promiseOrSync(r, () => {
				this.mutate(event);
				return this.#messages.splice(0);
			}, () => {
				this.#handling = false;
			});
		}
		catch (err) {
			this.#handling = false;
			throw err;
		}
	}

	/** Format a command and put it to the execution queue */
	protected enqueue(commandType: string): void;
	protected enqueue(commandType: string, aggregateId: Identifier): void;
	protected enqueue<T>(commandType: string, aggregateId: Identifier | undefined, payload: T): void;
	protected enqueue<T>(commandType: string, aggregateId?: Identifier, payload?: T) {
		if (typeof commandType !== 'string' || !commandType.length)
			throw new TypeError('commandType argument must be a non-empty String');
		if (!['string', 'number', 'undefined'].includes(typeof aggregateId))
			throw new TypeError('aggregateId argument must be either string, number or undefined');

		this.enqueueRaw({
			aggregateId,
			type: commandType,
			payload
		});
	}

	/** Put a command to the execution queue */
	protected enqueueRaw(command: ICommand) {
		if (typeof command !== 'object' || !command)
			throw new TypeError('command argument must be an Object');
		if (typeof command.type !== 'string' || !command.type.length)
			throw new TypeError('command.type argument must be a non-empty String');

		this.#messages.push(command);
	}

	/** Get human-readable Saga name */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
