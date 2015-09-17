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
		if (initialState || events) {
			if (!initialState) throw new TypeError('initialState argument required');
			if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');
		}

		this[KEY_ID] = id;
		this[KEY_VERSION] = 0;
		this[KEY_CHANGES] = [];
		this[KEY_STATE] = initialState;

		if (events) {
			for (var e of events) {
				this.state.mutate(e);
				this[KEY_VERSION]++;
			}
		}
	}

	/**
	 * Registers new aggregate event and mutates aggregate state
	 * @param  {String} eventType 		Event name
	 * @param  {Object} eventPayload 	Event data
	 */
	emit(eventType, eventPayload) {
		if (!eventType) throw new TypeError('eventType argument required');

		const evt = {
			aggregateId: this.id,
			version: this.version,
			type: typeof eventType === 'string' ? eventType : eventType.type,
			payload: typeof eventType === 'string' ? eventPayload : eventType.payload,
			localTime: new Date()
		};

		if (this.state) {
			this.state.mutate(evt);
		}

		this[KEY_CHANGES].push(evt);
		this[KEY_VERSION]++;
	}
}

module.exports = AbstractAggregate;
