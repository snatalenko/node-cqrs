'use strict';

/**
 * @param {AsyncIterableIterator<IEvent>} iterator
 * @returns {Promise<IEvent[]>}
 */
async function readEventsFromIterator(iterator) {
	const events = [];
	for await (const event of iterator)
		events.push(event);
	return events;
}

module.exports = readEventsFromIterator;
