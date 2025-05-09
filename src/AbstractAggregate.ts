import {
	IAggregate,
	IMutableAggregateState,
	ICommand,
	Identifier,
	IEvent,
	IEventSet,
	IAggregateConstructorParams
} from './interfaces';

import { getClassName, validateHandlers, getHandler, getMessageHandlerNames } from './utils';

const SNAPSHOT_EVENT_TYPE = 'snapshot';

/**
 * Base class for Aggregate definition
 */
export abstract class AbstractAggregate<TState extends IMutableAggregateState | object | void> implements IAggregate {

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

	#id: Identifier;
	#changes: IEvent[] = [];
	#version: number = 0;
	#snapshotVersion: number | undefined;

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
	 * 	// create snapshot every 50 events
	 * 	return this.version % 50 === 0;
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
			this.restoreSnapshot(event);
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
	async handle(command: ICommand) {
		if (!command)
			throw new TypeError('command argument required');
		if (!command.type)
			throw new TypeError('command.type argument required');

		const handler = getHandler(this, command.type);
		if (!handler)
			throw new Error(`'${command.type}' handler is not defined or not a function`);

		this.command = command;

		await handler.call(this, command.payload, command.context);

		return this.popChanges();
	}

	/** Get events emitted during command(s) handling and reset the `changes` collection */
	protected popChanges(): IEventSet {
		if (this.shouldTakeSnapshot)
			this.emit(SNAPSHOT_EVENT_TYPE, this.makeSnapshot());

		return this.#changes.splice(0);
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

	/** Create an aggregate state snapshot */
	protected makeSnapshot(): any {
		if (!this.state)
			throw new Error('state property is empty, either define state or override makeSnapshot method');

		return structuredClone(this.state);
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

		Object.assign(this.state, structuredClone(snapshotEvent.payload));
	}

	/** Get human-readable aggregate identifier */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
