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
	 */
	apply(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		handler.call(this, event);

		this[_version] += 1;
	}

	enqueue(commandType, commandPayload) {
		if (!commandType) throw new TypeError('commandType argument required');

		const command = {
			sagaId: this.id,
			sagaVersion: this.version,
			type: commandType,
			payload: commandPayload
		};

		this[_messages].push(command);
	}

	/**
	 * Clear the execution queue
	 */
	resetUncommittedMessages() {
		this[_messages].length = 0;
	}
};
