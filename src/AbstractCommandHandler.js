'use strict';

const Observer = require('./Observer');
const utils = require('./utils');
const validate = require('./validate');

function debug() {}

class AbstractCommandHandler extends Observer {

	constructor(eventStore, commandTypes) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (!commandTypes) throw new TypeError('commandTypes argument required');
		if (!Array.isArray(commandTypes) && typeof commandTypes !== 'string') throw new TypeError('commandTypes argument must be either a String or an Array');

		super();

		this.debug = debug;

		this._eventStore = eventStore;
		this._commandTypes = typeof commandTypes === 'string' ? Array.prototype.slice.call(arguments, 1) : commandTypes.slice(0);
		this._loadAggregate = this._loadAggregate.bind(this);
		this._onAggregateCreated = this._onAggregateCreated.bind(this);
		this._onAggregateRestored = this._onAggregateRestored.bind(this);
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
			.then(this._invokeAggregateCommandHandler.bind(this, cmd))
			.then(this._commitAggregateEvents.bind(this, cmd.context))
			.then(this._onExecutionComplete.bind(this, cmd.type));
	}

	_loadAggregate(aggregateId) {
		if (aggregateId) {
			return this._eventStore.getEvents(aggregateId)
				.then(events => this.getAggregate(aggregateId, events))
				.then(this._onAggregateRestored);
		}
		else {
			return Promise.resolve(this._eventStore.getNewId())
				.then(id => this.getAggregate(id, []))
				.then(this._onAggregateCreated);
		}
	}

	getAggregate(aggregateId, events) {
		throw new Error('getAggregate(aggregateId, events) is not defined on command handler');
	}

	_onAggregateCreated(aggregate) {
		this.debug('aggregate %s created', aggregate && aggregate.id);
		return aggregate;
	}

	_onAggregateRestored(aggregate) {
		this.debug('aggregate %s version %d restored from event stream', aggregate && aggregate.id, aggregate && aggregate.version);
		return aggregate;
	}

	_invokeAggregateCommandHandler(cmd, aggregate) {
		if (!cmd) throw new TypeError('cmd argument required');
		if (!aggregate) throw new TypeError('aggregate argument required');

		return utils.passToHandlerAsync(aggregate, cmd.type, cmd.payload, cmd.context)
			.then(r => r && this.warn('%s handler returned result which will be ignored. Aggregate command handlers should not return any data.', cmd.type))
			.then(() => aggregate.changes);
	}

	_commitAggregateEvents(context, changes) {
		if (!context) throw new TypeError('context argument required');
		if (!Array.isArray(changes)) throw new TypeError('changes argument must be an Array of aggregate events');
		if (!changes.length) return [];

		return this._eventStore.commit(context, changes).then(() => changes);
	}

	_onExecutionComplete(commandType, changes) {
		this.debug('%s execution complete, %d event(s) produced', commandType, changes && changes.length);
		return changes;
	}

	warn( /* message args */ ) {
		if (this.debug === debug) {
			console.warn.apply(console, arguments);
		}
		else {
			this.debug.apply(this.debug, arguments);
		}
	}
}

module.exports = AbstractCommandHandler;
