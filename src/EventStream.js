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
		const events = [].concat(...args);
		super(...events.map(el => Object.freeze(el)));
		Object.freeze(this);
	}

	/**
	 * Create new EventStream with events that match certain condition
	 *
	 * @param {(event: IEvent, index: number, all: Array<IEvent>) => boolean} condition
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
	 * @param {(event: IEvent, index: number, all: Array<IEvent>) => TResult} mapFn
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
