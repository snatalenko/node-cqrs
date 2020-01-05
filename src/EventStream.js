'use strict';

/**
 * An immutable collection of events
 *
 * @class EventStream
 * @extends {Array}
 * @implements {IEventStream}
 */
class EventStream extends Array {

	/**
	 * Creates an instance of EventStream
	 *
	 * @param {...(IEvent | Array<IEvent> | ReadonlyArray<IEvent>)} args
	 */
	constructor(...args) {
		super();

		const events = [].concat(...args);
		for (const e of events)
			super.push(Object.freeze(e));

		Object.freeze(this);
	}

	/**
	 * Create new EventStream with events that match certain condition
	 *
	 * @param {function(IEvent, number, Array<IEvent>): boolean} condition
	 * @returns {EventStream}
	 * @memberof EventStream
	 */
	filter(condition) {
		return new EventStream([...this].filter(condition));
	}

	/**
	 * Map stream events to another collection
	 *
	 * @template TResult
	 * @param {function(IEvent, number, Array<IEvent>): TResult} mapFn
	 * @returns {Array<TResult>}
	 * @memberof EventStream
	 */
	map(mapFn) {
		return [...this].map(mapFn);
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
}

module.exports = EventStream;
