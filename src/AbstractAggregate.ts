import {
	IAggregate,
	IAggregateState,
	ICommand,
	Identifier,
	IEvent,
	IEventSet,
	IAggregateConstructorParams
} from "./interfaces";

import { getClassName, validateHandlers, getHandler } from './utils';

/**
 * Deep-clone simple JS object
 */
function clone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

const SNAPSHOT_EVENT_TYPE = 'snapshot';

/**
 * Base class for Aggregate definition
 */
export abstract class AbstractAggregate<TState extends IAggregateState|void> implements IAggregate {

	/**
	 * Optional list of commands handled by Aggregate.
	 * 
	 * If not overridden in Aggregate implementation,
	 * `AggregateCommandHandler` will treat all public methods as command handlers
	 *
	 * @example
	 * 	return ['createUser', 'changePassword'];
	 */
	static get handles(): string[] | undefined {
		return undefined;
	}

	#id: Identifier;
	#changes: IEvent[] = [];
	#version: number = 0;
	#snapshotVersion: number | undefined;

	/** Internal aggregate state */
	protected state?: TState;

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

	/** Events emitted by Aggregate */
	get changes(): IEventSet {
		return [...this.#changes];
	}

	/**
	 * Override to define whether an aggregate state snapshot should be taken
	 *
	 * @example
	 * 	// create snapshot every 50 events
	 * 	return this.version % 50 === 0;
	 */
	get shouldTakeSnapshot(): boolean {
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

	/** Pass command to command handler */
	handle(command: ICommand) {
		if (!command)
			throw new TypeError('command argument required');
		if (!command.type)
			throw new TypeError('command.type argument required');

		const handler = getHandler(this, command.type);
		if (!handler)
			throw new Error(`'${command.type}' handler is not defined or not a function`);

		this.command = command;

		return handler.call(this, command.payload, command.context);
	}

	/** Mutate aggregate state and increment aggregate version */
	mutate(event) {
		if (event.aggregateVersion !== undefined)
			this.#version = event.aggregateVersion;

		if (event.type === SNAPSHOT_EVENT_TYPE) {
			this.#snapshotVersion = event.aggregateVersion;
			this.restoreSnapshot(event);
		}
		else if (this.state) {
			const handler = this.state.mutate || getHandler(this.state, event.type);
			if (handler)
				handler.call(this.state, event);
		}

		this.#version += 1;
	}

	/** Format and register aggregate event and mutate aggregate state */
	protected emit<TPayload>(type: string, payload?: TPayload) {
		if (typeof type !== 'string' || !type.length)
			throw new TypeError('type argument must be a non-empty string');

		const event = this.makeEvent<TPayload>(type, payload, this.command);

		this.emitRaw(event);
	}

	/** Format event based on a current aggregate state and a command being executed */
	protected makeEvent<TPayload>(type: string, payload?: TPayload, sourceCommand?: ICommand): IEvent<TPayload> {
		const event: IEvent<TPayload> = {
			aggregateId: this.id,
			aggregateVersion: this.version,
			type,
			payload
		};

		if (sourceCommand) {
			// augment event with command context
			const { context, sagaId, sagaVersion } = sourceCommand;
			if (context !== undefined)
				event.context = context;
			if (sagaId !== undefined)
				event.sagaId = sagaId;
			if (sagaVersion !== undefined)
				event.sagaVersion = sagaVersion;
		}

		return event;
	}

	/** Register aggregate event and mutate aggregate state */
	protected emitRaw<TPayload>(event: IEvent<TPayload>): void {
		if (!event)
			throw new TypeError('event argument required');
		if (!event.aggregateId)
			throw new TypeError('event.aggregateId argument required');
		if (typeof event.aggregateVersion !== 'number')
			throw new TypeError('event.aggregateVersion argument must be a Number');
		if (typeof event.type !== 'string' || !event.type.length)
			throw new TypeError('event.type argument must be a non-empty String');

		this.mutate(event);

		this.#changes.push(event);
	}

	/**
	 * Take an aggregate state snapshot and add it to the changes queue
	 */
	takeSnapshot() {
		this.emit(SNAPSHOT_EVENT_TYPE, this.makeSnapshot());
	}

	/** Create an aggregate state snapshot */
	makeSnapshot(): TState {
		if (!this.state)
			throw new Error('state property is empty, either define state or override makeSnapshot method');

		return clone(this.state);
	}

	/** Restore aggregate state from a snapshot */
	protected restoreSnapshot(snapshotEvent: IEvent<TState>) {
		if (!snapshotEvent)
			throw new TypeError('snapshotEvent argument required');
		if (!snapshotEvent.type)
			throw new TypeError('snapshotEvent.type argument required');
		if (!snapshotEvent.payload)
			throw new TypeError('snapshotEvent.payload argument required');

		if (snapshotEvent.type !== SNAPSHOT_EVENT_TYPE)
			throw new Error(`${SNAPSHOT_EVENT_TYPE} event type expected`);
		if (!this.state)
			throw new Error('state property is empty, either defined state or override restoreSnapshot method');

		Object.assign(this.state, clone(snapshotEvent.payload));
	}

	/** Get human-readable aggregate identifier */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
