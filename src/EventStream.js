'use strict';

/**
 * Format event before adding to event stream
 *
 * @param {IEvent} event
 * @returns {IEvent}
 */
function formatEvent(event) {
	return Object.freeze(event);
}

module.exports = class EventStream extends Array {

	/**
	 * Create EventStream instance from enumerable source
	 *
	 * @static
	 * @param {IEvent[]} events
	 * @param {(event: IEvent) => IEvent} [mapFn]
	 * @returns {EventStream}
	 */
	static from(events, mapFn) {
		return Object.freeze(super.from(events, mapFn));
	}

	/**
	 * Creates an instance of EventStream
	 *
	 * @param {...IEvent} events
	 */
	constructor(...events) {
		super(...events.map(formatEvent));
	}

	/**
	 * Add new events to event stream
	 *
	 * @param {...IEvent} events
	 * @returns
	 */
	push(...events) {
		return super.push(...events.map(formatEvent));
	}

	/**
	 * Returns a string description of event stream
	 *
	 * @returns {string}
	 */
	toString() {
		if (this.length === 1)
			return `'${this[0].type}'`;

		return `${this.length} events`;
	}
};
