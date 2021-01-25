'use strict';

import {
	IAggregate,
	IAggregateState,
	ICommand,
	Identifier,
	IEvent,
	IEventStream,
	TAggregateConstructorParams,
	TSnapshot
} from "./interfaces";

import { getClassName, validateHandlers, getHandler } from './utils';

/**
 * Deep-clone simple JS object
 */
function clone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

const getSchemaVersionFromState = (state: IAggregateState) =>
	(state && 'schemaVersion' in state && state.schemaVersion) ||
	(state && state.constructor && state.constructor.schemaVersion) ||
	0;

/**
 * Base class for Aggregate definition
 */
export default abstract class AbstractAggregate<TState extends IAggregateState> implements IAggregate {

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
	get changes(): IEventStream {
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

	/**
	 * Creates an instance of AbstractAggregate.
	 */
	constructor(options: TAggregateConstructorParams<TState>) {
		const { id, state, snapshot, events } = options;
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

		if (snapshot)
			this.restoreSnapshot(snapshot);

		if (events)
			events.forEach(event => this.mutate(event));
	}

	/**
	 * Pass command to command handler
	 */
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

	/**
	 * Mutate aggregate state and increment aggregate version
	 */
	protected mutate(event: IEvent) {
		if (event.aggregateVersion !== undefined)
			this.#version = event.aggregateVersion;

		if (this.state) {
			const handler = getHandler(this.state, event.type);
			if (handler)
				handler.call(this.state, event);
		}

		this.#version += 1;
	}

	/**
	 * Format and register aggregate event and mutate aggregate state
	 */
	protected emit<TPayload>(type: string, payload?: TPayload) {
		if (typeof type !== 'string' || !type.length)
			throw new TypeError('type argument must be a non-empty string');

		const event = this.makeEvent<TPayload>(type, payload, this.command);

		this.emitRaw(event);
	}

	/**
	 * Format event based on a current aggregate state
	 * and a command being executed
	 */
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

	/**
	 * Register aggregate event and mutate aggregate state
	 */
	protected emitRaw<TPayload>(event: IEvent<TPayload>): void {
		if (!event) throw new TypeError('event argument required');
		if (!event.aggregateId) throw new TypeError('event.aggregateId argument required');
		if (typeof event.aggregateVersion !== 'number') throw new TypeError('event.aggregateVersion argument must be a Number');
		if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type argument must be a non-empty String');

		this.mutate(event);

		this.#changes.push(event);
	}

	/**
	 * Create an aggregate state snapshot
	 */
	makeSnapshot(): TSnapshot {
		if (!this.state)
			throw new Error('state property is empty, either define state or override makeSnapshot method');

		const events = this.changes;

		return {
			lastEvent: events[events.length - 1],
			schemaVersion: getSchemaVersionFromState(this.state),
			data: clone(this.state)
		};
	}

	/**
	 * Restore aggregate state from a snapshot 
	 */
	protected restoreSnapshot(snapshot: TSnapshot<TState>) {
		if (typeof snapshot !== 'object' || !snapshot)
			throw new TypeError('snapshot argument must be an Object');
		if (!snapshot.data)
			throw new TypeError('snapshot.data argument required');
		if (!snapshot.lastEvent)
			throw new TypeError('snapshot.lastEvent argument required');
		if (snapshot.schemaVersion === undefined)
			throw new TypeError('snapshot.schemaVersion argument required');
		if (!this.state)
			throw new Error('state property is empty, either defined state or override restoreSnapshot method');

		const stateSchemaVersion = getSchemaVersionFromState(this.state);
		if (snapshot.schemaVersion !== stateSchemaVersion)
			throw new Error(`Snapshot version ${snapshot.schemaVersion} does not match aggregate state schema version ${stateSchemaVersion}`);

		Object.assign(this.state, clone(snapshot.data));

		this.#snapshotVersion = snapshot.lastEvent.aggregateVersion;
	}

	/**
	 * Get human-readable aggregate identifier
	 */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
