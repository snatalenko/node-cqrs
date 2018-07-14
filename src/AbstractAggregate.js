'use strict';

const { validateHandlers, getHandler, getClassName } = require('./utils');
const EventStream = require('./EventStream');

/**
 * Deep-clone simple JS object
 * @template T
 * @param {T} obj
 * @returns {T}
 */
const clone = obj => JSON.parse(JSON.stringify(obj));

const SNAPSHOT_EVENT_TYPE = 'snapshot';

const _id = Symbol('id');
const _changes = Symbol('changes');
const _version = Symbol('version');
const _snapshotVersion = Symbol('snapshotVersion');

/**
 * Base class for Aggregate definition
 *
 * @class AbstractAggregate
 * @implements {IAggregate}
 */
class AbstractAggregate {

	/**
	 * List of commands handled by Aggregate
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 * @example
	 * 	return ['createUser', 'changePassword'];
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
	 * Aggregate Snapshot Version
	 *
	 * @type {number|undefined}
	 * @readonly
	 */
	get snapshotVersion() {
		return this[_snapshotVersion];
	}

	/**
	 * Events emitted by Aggregate command handlers
	 *
	 * @type {IEventStream}
	 * @readonly
	 */
	get changes() {
		return new EventStream(this[_changes]);
	}

	/**
	 * Override to define, whether an aggregate state snapshot should be taken
	 *
	 * @type {boolean}
	 * @readonly
	 * @example
	 * 	// create snapshot every 50 events
	 * 	return this.version % 50 === 0;
	 */
	get shouldTakeSnapshot() {	// eslint-disable-line class-methods-use-this
		return false;
	}

	/**
	 * Creates an instance of AbstractAggregate.
	 *
	 * @param {TAggregateParams} options
	 */
	constructor(options) {
		const { id, state, events } = options;
		if (!id) throw new TypeError('id argument required');
		if (state && typeof state !== 'object') throw new TypeError('state argument, when provided, must be an Object');
		if (events && !Array.isArray(events)) throw new TypeError('events argument, when provided, must be an Array');

		this[_id] = id;
		this[_changes] = [];
		this[_version] = 0;
		this[_snapshotVersion] = 0;

		validateHandlers(this);

		if (state)
			this.state = state;

		if (events)
			events.forEach(event => this.mutate(event));
	}

	/**
	 * Pass command to command handler
	 *
	 * @param {ICommand} command
	 * @returns {any}
	 */
	handle(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		const handler = getHandler(this, command.type);
		if (!handler)
			throw new Error(`'${command.type}' handler is not defined or not a function`);

		this.command = command;

		return handler.call(this, command.payload, command.context);
	}

	/**
	 * Mutate aggregate state and increment aggregate version
	 *
	 * @protected
	 * @param {IEvent} event
	 */
	mutate(event) {
		if ('aggregateVersion' in event)
			this[_version] = event.aggregateVersion;

		if (event.type === SNAPSHOT_EVENT_TYPE) {
			this[_snapshotVersion] = event.aggregateVersion;
			this.restoreSnapshot(event);
		}
		else if (this.state) {
			const handler = this.state.mutate || getHandler(this.state, event.type);
			if (handler)
				handler.call(this.state, event);
		}

		this[_version] += 1;
	}

	/**
	 * Format and register aggregate event and mutate aggregate state
	 *
	 * @protected
	 * @param {string} type - event type
	 * @param {object} [payload] - event data
	 */
	emit(type, payload) {
		if (typeof type !== 'string' || !type.length) throw new TypeError('type argument must be a non-empty string');

		const event = this.makeEvent(type, payload, this.command);

		this.emitRaw(event);
	}

	/**
	 *
	 * @param {string} type
	 * @param {any} [payload]
	 * @param {ICommand} [sourceCommand]
	 * @returns {IEvent}
	 */
	makeEvent(type, payload, sourceCommand) {
		/** @type {IEvent} */
		const event = {
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
	 *
	 * @protected
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

	/**
	 * Take an aggregate state snapshot and add it to the changes queue
	 */
	takeSnapshot() {
		this.emit(SNAPSHOT_EVENT_TYPE, this.makeSnapshot());
	}

	/**
	 * Create an aggregate state snapshot
	 *
	 * @protected
	 * @returns {object}
	  */
	makeSnapshot() {
		if (!this.state)
			throw new Error('state property is empty, either define state or override makeSnapshot method');

		return clone(this.state);
	}

	/**
	 * Restore aggregate state from a snapshot
	 *
	 * @protected
	 * @param {IEvent} snapshotEvent
	 */
	restoreSnapshot(snapshotEvent) {
		if (!snapshotEvent) throw new TypeError('snapshotEvent argument required');
		if (!snapshotEvent.type) throw new TypeError('snapshotEvent.type argument required');
		if (!snapshotEvent.payload) throw new TypeError('snapshotEvent.payload argument required');

		if (snapshotEvent.type !== SNAPSHOT_EVENT_TYPE)
			throw new Error(`${SNAPSHOT_EVENT_TYPE} event type expected`);
		if (!this.state)
			throw new Error('state property is empty, either defined state or override restoreSnapshot method');

		Object.assign(this.state, clone(snapshotEvent.payload));
	}

	/**
	 * Get human-readable aggregate identifier
	 */
	toString() {
		return `${getClassName(this)} ${this.id} (v${this.version})`;
	}
}

module.exports = AbstractAggregate;
