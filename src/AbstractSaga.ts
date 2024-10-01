import { ICommand, IEvent, ISaga, ISagaConstructorParams } from "./interfaces";

import { getClassName, validateHandlers, getHandler } from './utils';

/**
 * Base class for Saga definition
 */
export abstract class AbstractSaga implements ISaga {

	/** List of events that start new saga, must be overridden in Saga implementation */
	static get startsWith(): string[] {
		throw new Error('startsWith must be overridden to return a list of event types that start saga');
	}

	/** List of event types being handled by Saga, must be overridden in Saga implementation */
	static get handles(): string[] {
		return [];
	}

	/** Saga ID */
	get id(): string {
		return this.#id;
	}

	/** Saga version */
	get version(): number {
		return this.#version;
	}

	/** Command execution queue */
	get uncommittedMessages(): ICommand[] {
		return Array.from(this.#messages);
	}

	#id: string;
	#version = 0;
	#messages: ICommand[] = [];

	/**
	 * Creates an instance of AbstractSaga
	 */
	constructor(options: ISagaConstructorParams) {
		if (!options)
			throw new TypeError('options argument required');
		if (!options.id)
			throw new TypeError('options.id argument required');

		this.#id = options.id;

		validateHandlers(this, 'startsWith');
		validateHandlers(this, 'handles');

		if (options.events) {
			options.events.forEach(e => this.apply(e));
			this.resetUncommittedMessages();
		}

		Object.defineProperty(this, 'restored', { value: true });
	}

	/** Modify saga state by applying an event */
	apply(event: IEvent): Promise<void> | void {
		if (!event)
			throw new TypeError('event argument required');
		if (!event.type)
			throw new TypeError('event.type argument required');

		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		const r = handler.call(this, event);
		if (r instanceof Promise) {
			return r.then(() => {
				this.#version += 1;
			});
		}

		this.#version += 1;
		return undefined;
	}

	/** Format a command and put it to the execution queue */
	protected enqueue(commandType: string, aggregateId: string | undefined, payload: object) {
		if (typeof commandType !== 'string' || !commandType.length)
			throw new TypeError('commandType argument must be a non-empty String');
		if (!['string', 'number', 'undefined'].includes(typeof aggregateId))
			throw new TypeError('aggregateId argument must be either string, number or undefined');

		this.enqueueRaw({
			aggregateId,
			sagaId: this.id,
			sagaVersion: this.version,
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

	/** Clear the execution queue */
	 resetUncommittedMessages() {
		this.#messages.length = 0;
	}

	/** Get human-readable Saga name */
	toString(): string {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}
