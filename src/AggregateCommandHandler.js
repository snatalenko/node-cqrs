/* eslint new-cap: "off" */
'use strict';

const Observer = require('./Observer');
const ConcurrencyError = require('./errors/ConcurrencyError');
const COMMIT_RETRIES_LIMIT = 5;
const isClass = require('./di/isClass');

/**
 * Restores aggregate state from the event store
 *
 * @param {string|object} id - Aggregate ID
 * @param {object} eventStore
 * @param {function} aggregateTypeOrFactory
 * @returns {PromiseLike<object>}
 */
function restoreAggregateState(id, eventStore, aggregateTypeOrFactory) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (!aggregateTypeOrFactory) throw new TypeError('aggregateTypeOrFactory argument required');

	const aggregateFactory = isClass(aggregateTypeOrFactory) ?
		options => new aggregateTypeOrFactory(options) :
		aggregateTypeOrFactory;

	if (id) {
		return eventStore.getAggregateEvents(id)
			.then(events => aggregateFactory({ id, events }));
	}

	return eventStore.getNewId()
		.then(newId => aggregateFactory({ id: newId }));
}

function signEventsContext(context) {
	return events => {
		if (context)
			events.forEach(event => { event.context = context; });
		return events;
	};
}

function commitAggregateEvents(eventStore) {
	if (!eventStore) throw new TypeError('eventStore argument required');

	return events => (events.length ?
		eventStore.commit(events) :
		Promise.resolve([]));
}

function isConcurrencyError(err) {
	return err.type === ConcurrencyError.type;
}


module.exports = class AggregateCommandHandler extends Observer {

	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.aggregateType) throw new TypeError('options.aggregateType argument required');

		super();

		this._eventStore = options.eventStore;
		this._aggregateTypeOrFactory = options.aggregateType;
		this._handles = options.handles || options.aggregateType.handles;
	}

	subscribe(commandBus) {
		return super.subscribe(commandBus, this._handles, this.execute);
	}

	/**
	 * Validates a command and passess it to corresponding aggregate
	 * @param  {Object} cmd command to execute
	 * @return {Promise} resolving to
	 */
	execute(cmd, options) {
		if (!cmd) throw new TypeError('cmd argument required');
		if (!cmd.type) throw new TypeError('cmd.type argument required');

		return restoreAggregateState(cmd.aggregateId, this._eventStore, this._aggregateTypeOrFactory)
			.then(aggregate => {
				this.info(`aggregate ${aggregate.id} (v${aggregate.version}) restored`);

				return aggregate.handle(cmd)
					.then(() => aggregate.changes);
			})
			.then(signEventsContext(cmd.context))
			.then(commitAggregateEvents(this._eventStore))
			.then(events => {
				this.info(`command '${cmd.type}' processed, ${events.length === 1 ? '1 event' : `${events.lengts} events`} produced`);
				return events;
			}, err => {
				const currentIteration = (options && options.iteration) || 0;
				if (isConcurrencyError(err) && currentIteration < COMMIT_RETRIES_LIMIT) {
					return this.execute(cmd, { iteration: currentIteration + 1 });
				}
				throw err;
			});
	}
};
