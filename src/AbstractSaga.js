'use strict';

const { validateHandlers, getHandler } = require('./utils');

const _id = Symbol('id');
const _version = Symbol('version');
const _messages = Symbol('messages');

/**
 * CQRS command
 * @typedef {{ type: string, sagaId: string, sagaVersion: number, aggregateId: string, payload: object }} ICommand
 */

/**
 * CQRS event
 * @typedef {{ type: string, sagaId: string, sagaVersion: number, aggregateId: string, payload: object }} IEvent
 */


module.exports = class AbstractSaga {

	/**
	 * List of event types being handled by Saga, must be overridden in Saga implementation
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		throw new Error('handles must be overridden to return a list of handled event types');
	}

	/**
	 * Saga ID
	 *
	 * @type {string|number}
	 * @readonly
	 */
	get id() {
		return this[_id];
	}

	/**
	 * Saga version
	 *
	 * @type {number}
	 * @readonly
	 */
	get version() {
		return this[_version];
	}

	/**
	 * Command execution queue
	 *
	 * @type {ICommand[]}
	 * @readonly
	 */
	get uncommittedMessages() {
		return Array.from(this[_messages]);
	}

	/**
	 * Creates an instance of AbstractSaga
	 *
	 * @param {{ id: string, events: IEvent[] }} options
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.id) throw new TypeError('options.id argument required');

		this[_id] = options.id;
		this[_version] = 0;
		this[_messages] = [];

		validateHandlers(this);

		if (options.events) {
			options.events.forEach(e => this.apply(e));
			this.resetUncommittedMessages();
		}

		Object.defineProperty(this, 'restored', { value: true });
	}

	/**
	 * Modify saga state by applying an event
	 *
	 * @param {IEvent} event
	 * @returns {void|Promise<void>}
	 */
	apply(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		const r = handler.call(this, event);
		if (r instanceof Promise) {
			return r.then(() => {
				this[_version] += 1;
			});
		}

		this[_version] += 1;
		return undefined;
	}

	/**
	 * Format a command and put it to the execution queue
	 *
	 * @param {string} commandType
	 * @param {string|number} aggregateId
	 * @param {object} payload
	 */
	enqueue(commandType, aggregateId, payload) {
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

	/**
	 * Put a command to the execution queue
	 *
	 * @param {ICommand} command
	 */
	enqueueRaw(command) {
		if (typeof command !== 'object' || !command) throw new TypeError('command argument must be an Object');
		if (typeof command.type !== 'string' || !command.type.length) throw new TypeError('command.type argument must be a non-empty String');

		this[_messages].push(command);
	}

	/**
	 * Clear the execution queue
	 */
	resetUncommittedMessages() {
		this[_messages].length = 0;
	}
};
