'use strict';

const Observer = require('./Observer');

function restoreAggregateState(aggregateId, eventStore, AggregateType) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (!AggregateType) throw new TypeError('AggregateType argument required');

	if (aggregateId) {
		return eventStore.getAggregateEvents(aggregateId).then(events => new AggregateType({
			id: aggregateId,
			events: events
		}));
	} else {
		return eventStore.getNewId().then(aggregateId => new AggregateType({
			id: aggregateId
		}));
	}
}

function commitAggregateEvents(eventStore) {
	if (!eventStore) throw new TypeError('eventStore argument required');

	return events => events.length ?
		eventStore.commit(events) :
		Promise.resolve([]);
}

module.exports = class AggregateCommandHandler extends Observer {

	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.aggregateType) throw new TypeError('options.aggregateType argument required');

		super();

		this._eventStore = options.eventStore;
		this._aggregateType = options.aggregateType;

		if (options.commandBus) {
			this.subscribe(options.commandBus);
		}
	}

	subscribe(commandBus) {
		return super.subscribe(commandBus, this._aggregateType.handles, this.execute);
	}

	/**
	 * Validates a command and passess it to corresponding aggregate
	 * @param  {Object} cmd command to execute
	 * @return {Promise} resolving to
	 */
	execute(cmd) {
		if (!cmd) throw new TypeError('cmd argument required');
		if (!cmd.type) throw new TypeError('cmd.type argument required');
		if (!cmd.context) throw new TypeError('cmd.context argument required');

		return restoreAggregateState(cmd.aggregateId, this._eventStore, this.aggregateType)
			.then(aggregate => {
				this.debug(`aggregate ${aggregate.id} (v${aggregate.version}) restored`);

				aggregate.handle(cmd);

				// sign events
				const events = aggregate.changes;
				events.forEach(e => {
					e.aggregateId = aggregate.id;
					e.context = cmd.context;
				});
				return events;
			})
			.then(commitAggregateEvents(this._eventStore))
			.then(events => {
				this.debug(`command '${cmd.type}' processed, ${events.length === 1? '1 event' : events.length + ' events'} produced`);
				return events;
			});
	}
};
