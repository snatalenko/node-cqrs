import { AggregateCommandHandler } from './AggregateCommandHandler.ts';
import {
	type IAggregate,
	type IMutableState,
	type ICommand,
	type Identifier,
	type IEvent,
	type IEventSet,
	type IAggregateConstructorParams,
	type ISnapshotEvent,
	type IAggregateConstructor,
	type IEventStore,
	type ICommandBus,
	SNAPSHOT_EVENT_TYPE,
	isSnapshotEvent,
	isEvent
} from './interfaces/index.ts';

import {
	getClassName,
	validateHandlers,
	getHandler,
	getMessageHandlerNames,
	clone
} from './utils/index.ts';

/**
 * Base class for Aggregate definition
 */
export abstract class AbstractAggregate<TState extends IMutableState | object | void = void> implements
	IAggregate {

	/**
	 * List of command names handled by the Aggregate.
	 *
	 * Can be overridden in the Aggregate implementation to explicitly define supported commands.
	 * If not overridden, all public methods will be treated as command handlers by default.
	 *
	 * @example ['createUser', 'changePassword'];
	 */
	static get handles(): string[] {
		return getMessageHandlerNames(this);
	}

	/**
	 * Convenience helper to create an `AggregateCommandHandler` for this aggregate type and
	 * subscribe it to the provided `commandBus`.
	 */
	static register<T extends AbstractAggregate, S extends IMutableState | object | void>(
		this: IAggregateConstructor<T, S> & (new (options: IAggregateConstructorParams<S>) => T),
		eventStore: IEventStore,
		commandBus: ICommandBus
	): AggregateCommandHandler<T> {
		const handler = new AggregateCommandHandler({ aggregateType: this, eventStore });
		handler.subscribe(commandBus);
		return handler;
	}

	#id: Identifier;
	#version: number = 0;
	#snapshotVersion: number | undefined;

	/** List of emitted events */
	protected changes: IEvent[] = [];

	/** Internal aggregate state */
	protected state: TState | undefined;

	/** Command being handled by aggregate */
	protected command?: ICommand;

	/** Unique aggregate instance identifier */
	get id(): Identifier {
		return this.#id;
	}

	/** Aggregate instance version */
	get version(): number {
		return this.#version;
	}

	/** Restored snapshot version */
	get snapshotVersion(): number | undefined {
		return this.#snapshotVersion;
	}

	/**
	 * Override to define whether an aggregate state snapshot should be taken
	 *
	 * @example
	 *   // create snapshot every 50 events if new events were emitted
	 *   return !!this.changes.length
	 *     && this.version - (this.snapshotVersion ?? 0) > 50;
	 */
	// eslint-disable-next-line class-methods-use-this
	protected get shouldTakeSnapshot(): boolean {
		return false;
	}

	constructor(options: IAggregateConstructorParams<TState>) {
		const { id, state, events } = options;
		if (!id)
			throw new TypeError('id argument required');
		if (state && typeof state !== 'object')
			throw new TypeError('state argument, when provided, must be an Object');
		if (events && !Array.isArray(events))
			throw new TypeError('events argument, when provided, must be an Array');

		this.#id = id;

		validateHandlers(this);

		if (state)
			this.state = state;

		if (events)
			events.forEach(event => this.mutate(event));
	}

	/** Mutate aggregate state and increment aggregate version */
	mutate(event: IEvent) {
		if (event.aggregateVersion !== undefined)
			this.#version = event.aggregateVersion;

		if (event.type === SNAPSHOT_EVENT_TYPE) {
			this.#snapshotVersion = event.aggregateVersion;
			this.restoreSnapshot(event as ISnapshotEvent<TState>);
		}
		else if (this.state) {
			const handler = 'mutate' in this.state ?
				this.state.mutate :
				getHandler(this.state, event.type);
			if (handler)
				handler.call(this.state, event);
		}

		this.#version += 1;
	}

	/** Pass command to command handler */
	async handle(command: ICommand): Promise<IEventSet> {
		if (!command)
			throw new TypeError('command argument required');
		if (!command.type)
			throw new TypeError('command.type argument required');

		const handler = getHandler(this, command.type);
		if (!handler)
			throw new Error(`'${command.type}' handler is not defined or not a function`);

		if (this.command)
			throw new Error('Another command is being processed');

		this.command = command;
		const eventsOffset = this.changes.length;

		try {
			await handler.call(this, command.payload, command.context);

			return this.getUncommittedEvents(eventsOffset);
		}
		finally {
			this.command = undefined;
		}
	}

	/**
	 * Get the events emitted during commands processing.
	 * If a snapshot should be taken, the snapshot event is added to the end.
	 */
	protected getUncommittedEvents(offset?: number): IEventSet {
		if (this.shouldTakeSnapshot)
			this.takeSnapshot();

		return this.changes.slice(offset);
	}

	/** Format and register aggregate event and mutate aggregate state */
	protected emit(type: string): IEvent<void>;
	protected emit<TPayload>(type: string, payload: TPayload): IEvent<TPayload>;
	protected emit<TPayload>(type: string, payload?: TPayload): IEvent<TPayload> {
		if (typeof type !== 'string' || !type.length)
			throw new TypeError('type argument must be a non-empty string');

		const event = this.makeEvent<TPayload>(type, payload as TPayload, this.command);

		this.emitRaw(event);

		return event;
	}

	/** Format event based on a current aggregate state and a command being executed */
	protected makeEvent<TPayload>(type: string, payload: TPayload, sourceCommand?: ICommand): IEvent<TPayload> {
		const event: IEvent<TPayload> = {
			aggregateId: this.id,
			aggregateVersion: this.version,
			type,
			payload
		};

		if (sourceCommand) {
			// augment event with command context
			const { context, sagaOrigins } = sourceCommand;
			if (context !== undefined)
				event.context = context;
			if (sagaOrigins !== undefined)
				event.sagaOrigins = { ...sagaOrigins };
		}

		return event;
	}

	/** Register aggregate event and mutate aggregate state */
	protected emitRaw<TPayload>(event: IEvent<TPayload>): void {
		if (!isEvent(event))
			throw new TypeError('event argument must be a valid IEvent');
		if (!event.aggregateId)
			throw new TypeError('event.aggregateId argument required');
		if (typeof event.aggregateVersion !== 'number')
			throw new TypeError('event.aggregateVersion argument must be a Number');

		this.mutate(event);

		this.changes.push(event);
	}

	/** Create an aggregate state snapshot */
	protected makeSnapshot(): any {
		if (!this.state)
			throw new Error('state property is empty, either define state or override makeSnapshot method');

		return clone(this.state);
	}

	/** Add snapshot event to the collection of emitted events */
	protected takeSnapshot() {
		const snapshotEvent = this.emit(SNAPSHOT_EVENT_TYPE, this.makeSnapshot());
		this.#snapshotVersion = snapshotEvent.aggregateVersion;
	}

	/** Restore aggregate state from a snapshot */
	protected restoreSnapshot(snapshotEvent: ISnapshotEvent<TState>) {
		if (!isSnapshotEvent(snapshotEvent))
			throw new TypeError('snapshotEvent argument must be a valid ISnapshotEvent');
		if (!snapshotEvent.payload)
			throw new TypeError('snapshotEvent.payload argument required');
		if (!this.state)
			throw new Error('state property is empty, either defined state or override restoreSnapshot method');

		Object.assign(this.state, clone(snapshotEvent.payload));
	}

	/** Get human-readable aggregate identifier */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
