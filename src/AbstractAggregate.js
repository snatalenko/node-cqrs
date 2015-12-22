'use strict';

const KEY_ID = Symbol();
const KEY_VERSION = Symbol();
const KEY_CHANGES = Symbol();
const KEY_STATE = Symbol();

class AbstractAggregate {

	/** Get aggregate ID */
	get id() {
		return this[KEY_ID];
	}

	/** Get aggregate version */
	get version() {
		return this[KEY_VERSION];
	}

	/** Get an Array of events registered in the aggregate */
	get changes() {
		return this[KEY_CHANGES].slice(0);
	}

	/** Get current Aggregate state */
	get state() {
		return this[KEY_STATE];
	}

	/** Get aggregate state JSON snapshot */
	get snapshot() {
		return JSON.parse(JSON.stringify(this.state));
	}

	constructor(id, initialState, events) {
		if (!id) throw new TypeError('id argument required');
		if (events && !Array.isArray(events)) throw new TypeError('events argument must be an Array');

		this[KEY_ID] = id;
		this[KEY_VERSION] = 0;
		this[KEY_CHANGES] = [];
		this[KEY_STATE] = initialState;

		if (events) {
			this.mutate(events);
		}
	}

	/** Mutates aggregate state and incremets aggregate version */
	mutate(events) {
		if (!Array.isArray(events)) {
			events = Array.from(arguments);
		}
		events.forEach(event => {
			if (this.state) {
				this.state.mutate(event);
			}
			this[KEY_VERSION]++;
		});
	}

	/**
	 * Registers new aggregate event and mutates aggregate state
	 * @param  {String} eventType 		Event name
	 * @param  {Object} eventPayload 	Event data
	 */
	emit(eventType, eventPayload) {
		if (typeof eventType !== 'string' || !eventType.length) throw new TypeError('eventType argument must be a non-empty string');

		const event = {
			aggregateId: this.id,
			version: this.version,
			type: eventType,
			payload: eventPayload,
			localTime: new Date()
		};

		this.mutate(event);

		this[KEY_CHANGES].push(event);
	}
}

module.exports = AbstractAggregate;
