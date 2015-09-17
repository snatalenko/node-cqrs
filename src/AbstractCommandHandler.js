'use strict';

const Observer = require('./Observer');
const utils = require('./utils');
const validate = require('./validate');

class AbstractCommandHandler extends Observer {

	constructor(eventStore, commandTypes) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (!commandTypes) throw new TypeError('commandTypes argument required');
		if (!Array.isArray(commandTypes)) throw new TypeError('commandTypes argument must be an Array');

		super();

		this.debug = function () {};
		this.eventStore = eventStore;
		this._commandTypes = commandTypes.slice(0);
		this._loadAggregate = this._loadAggregate.bind(this);
	}

	subscribe(commandBus) {
		super.subscribe(commandBus, this._commandTypes, this.execute);
	}

	/**
	 * Validates a command and passess it to corresponding aggregate
	 * @param  {Object} cmd command to execute
	 * @return {Promise} resolving to
	 */
	execute(cmd) {
		this.debug('execute %s', cmd && cmd.type);
		validate.object(cmd, 'cmd');
		validate.string(cmd.type, 'cmd.type');
		validate.context(cmd.context);

		return Promise.resolve(cmd.aggregateId)
			.then(this._loadAggregate)
			.then(this._invokeCommandHandler.bind(this, cmd))
			.then(function (aggregate) {
				return aggregate.changes;
			})
			.then(this._commitAggregateEvents.bind(this, cmd.context))
			.then(this._onExecutionComplete.bind(this, cmd.type));
	}

	_loadAggregate(aggregateId) {
		this.debug('_loadAggregate %s', aggregateId);

		if (aggregateId) {
			return this.eventStore.getEvents(aggregateId)
				.then(events => this.getAggregate(aggregateId, events))
				.then(this._onAggregateRestored.bind(this));
		}
		else {
			return Promise.resolve(this.eventStore.getNewId())
				.then(id => this.getAggregate(id, []))
				.then(this._onAggregateCreated.bind(this));
		}
	}

	getAggregate(aggregateId, events) {
		throw new Error('getAggregate(aggregateId, events) is not defined on command handler');
	}

	_onAggregateCreated(aggregate) {
		this.debug('new aggregate %s created', aggregate && aggregate.id);
		return aggregate;
	}

	_onAggregateRestored(aggregate) {
		this.debug('aggregate %s version %d restored from event stream', aggregate && aggregate.id, aggregate && aggregate.version);
		return aggregate;
	}

	_invokeCommandHandler(cmd, aggregate) {
		this.debug('_invokeCommandHandler %s', cmd && cmd.type);

		if (!cmd) throw new TypeError('cmd argument required');
		if (!aggregate) throw new TypeError('aggregate argument required');

		const handleAsync = utils.canHandle(this, cmd.type) ?
			Promise.resolve(utils.passToHandler(this, cmd.type, aggregate, cmd.payload, cmd.context)) :
			Promise.resolve(utils.passToHandler(aggregate, cmd.type, cmd.payload, cmd.context));

		return handleAsync.then(function (result) {
			if (result) {
				this.debug('%s execution returned result (%s) which will be ignored. Aggregate methods should not return any data.', cmd.type, result);
			}
			return aggregate;
		}.bind(this));
	}

	_commitAggregateEvents(context, changes) {
		this.debug('_commitAggregateEvents');

		if (!context) throw new TypeError('context argument required');
		if (!Array.isArray(changes)) throw new TypeError('changes argument must be an Array of aggregate events');

		if (changes.length) {
			return this.eventStore.commit(context, changes)
				.then(function () {
					return changes;
				});
		}
		else {
			this.debug('aggregate was not changed');
			return Promise.resolve(changes);
		}
	}

	_onExecutionComplete(commandType, changes) {
		this.debug('%s execution complete, %d event(s) produced', commandType, changes && changes.length);
		return changes;
	}
}

module.exports = AbstractCommandHandler;
