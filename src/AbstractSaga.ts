import type {
	ICommand, ICommandBus, Identifier, IEvent, IEventStore, IMutableState, ISaga, ISagaConstructor,
	ISagaConstructorParams
} from './interfaces/index.ts';
import { SagaEventHandler } from './SagaEventHandler.ts';
import {
	validateHandlers,
	getHandler,
	getClassName,
	getMessageHandlerNames,
	assertDefined,
	assertString,
	assertMessage,
	assertEvent
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
		assertDefined(options, 'options');
		assertDefined(options.id, 'options.id');
		if (options.events)
			throw new TypeError('options.events argument is deprecated');

		this.#id = options.id;

		validateHandlers(this, 'startsWith');
		validateHandlers(this, 'handles');
	}

	/** Modify saga state by applying an event */
	mutate(event: IEvent): void {
		assertEvent(event, 'event');

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
	async handle(event: IEvent): Promise<ReadonlyArray<ICommand>> {
		assertEvent(event, 'event');

		if (this.#handling)
			throw new Error('Another event is being processed, concurrent handling is not allowed');

		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		this.#handling = true;
		this.#messages.length = 0;

		try {
			await handler.call(this, event);
			this.mutate(event);
			return this.#messages.splice(0);
		}
		finally {
			this.#handling = false;
		}
	}

	/** Format a command and put it to the execution queue */
	protected enqueue(commandType: string): void;
	protected enqueue(commandType: string, aggregateId: Identifier): void;
	protected enqueue<T>(commandType: string, aggregateId: Identifier | undefined, payload: T): void;
	protected enqueue<T>(commandType: string, aggregateId?: Identifier, payload?: T) {
		assertString(commandType, 'commandType');

		this.enqueueRaw({
			aggregateId,
			type: commandType,
			payload
		});
	}

	/** Put a command to the execution queue */
	protected enqueueRaw(command: ICommand) {
		assertMessage(command, 'command');

		this.#messages.push(command);
	}

	/** Get human-readable Saga name */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
