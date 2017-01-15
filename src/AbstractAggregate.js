'use strict';

const validateHandlers = require('./utils/validateHandlers');
const passToHandlerAsync = require('./utils/passToHandlerAsync');
const getHandler = require('./utils/getHandler');
const EventStream = require('./EventStream');

const _id = Symbol('id');
const _version = Symbol('version');
const _changes = Symbol('changes');

/**
 * CQRS Command
 * @typedef {{type: string, aggregateId: string, payload: object, context: object}} ICommand
 */

/**
 * CQRS Event
 * @typedef {{type: string, aggregateId: string, aggregateVersion, payload: object, context: object }} IEvent
 */

module.exports = class AbstractAggregate {

	/**
	 * List of commands handled by Aggregate
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		throw new Error('handles must be overridden to return a list of handled command types');
	}

	/**
	 * Aggregate ID
	 *
	 * @type {string|number}
	 * @readonly
	 */
	get id() {
		return this[_id];
	}

	/**
	 * Aggregate Version
	 *
	 * @type {number}
	 * @readonly
	 */
	get version() {
		return this[_version];
	}

	/**
	 * Events emitted by Aggregate command handlers
	 *
	 * @type {IEvent[]}
	 * @readonly
	 */
	get changes() {
		return EventStream.from(this[_changes]);
	}

	/**
	 * Copy of Aggregate state
	 *
	 * @type {object}
	 * @readonly
	 */
	get snapshot() {
		return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
	}

	/**
	 * Creates an instance of AbstractAggregate.
	 *
	 * @param {{ id: string|number, events: IEvent[], state: object }} options
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.id) throw new TypeError('options.id argument required');
		if (options.events && !Array.isArray(options.events)) throw new TypeError('options.events argument, when provided, must be an Array');

		this[_id] = options.id;
		this[_version] = 0;
		this[_changes] = [];

		validateHandlers(this);

		if (options.state)
			this.state = options.state;
		if (options.events)
			options.events.forEach(e => this.mutate(e));
	}

	/**
	 * Pass command to command handler
	 *
	 * @param {ICommand} command
	 * @returns
	 */
	handle(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		return passToHandlerAsync(this, command.type, command.payload, command.context);
	}

	/**
	 * Mutate aggregate state and increment aggregate version
	 *
	 * @param {IEvent} event
	 */
	mutate(event) {
		if (this.state) {
			const handler = this.state.mutate || getHandler(this.state, event.type);
			if (handler) {
				handler.call(this.state, event);
			}
		}
		this[_version] += 1;
	}

	/**
	 * Format and register aggregate event and mutate aggregate state
	 *
	 * @param {string} type - event type
	 * @param {object} payload - event data
	 */
	emit(type, payload) {
		if (typeof type !== 'string' || !type.length) throw new TypeError('type argument must be a non-empty string');

		return this.emitRaw({
			aggregateId: this.id,
			aggregateVersion: this.version,
			type,
			payload
		});
	}

	/**
	 * Register aggregate event and mutate aggregate state
	 *
	 * @param {IEvent} event
	 */
	emitRaw(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.aggregateId) throw new TypeError('event.aggregateId argument required');
		if (typeof event.aggregateVersion !== 'number') throw new TypeError('event.aggregateVersion argument must be a Number');
		if (typeof event.type !== 'string' || !event.type.length) throw new TypeError('event.type argument must be a non-empty String');

		this.mutate(event);

		this[_changes].push(event);
	}
};
