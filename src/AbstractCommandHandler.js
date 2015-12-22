'use strict';

const Observer = require('./Observer');
const utils = require('./utils');
const validate = require('./validate');

function restoreAggregate(eventStore, factory) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (typeof factory !== 'function') throw new TypeError('factory argument must be a Function');

	return aggregateId => aggregateId ?
		eventStore.getAggregateEvents(aggregateId).then(events => factory(aggregateId, events)) :
		Promise.resolve(eventStore.getNewId()).then(id => factory(id));
}

function passCommandToAggregate(cmd) {
	if (!cmd) throw new TypeError('cmd argument required');

	return aggregate => utils.passToHandlerAsync(aggregate, cmd.type, cmd.payload, cmd.context)
		.then(r => r && console.warn('%s handler returned result which will be ignored. Aggregate command handlers should not return any data.', cmd.type))
		.then(() => aggregate);
}

function commitAggregateEvents(eventStore, context) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (!context) throw new TypeError('context argument required');

	return aggregate => aggregate.changes.length ?
		eventStore.commit(context, aggregate.changes) :
		Promise.resolve([]);
}

class AbstractCommandHandler extends Observer {

	constructor(eventStore, commandTypes) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (!commandTypes) throw new TypeError('commandTypes argument required');
		if (!Array.isArray(commandTypes) && typeof commandTypes !== 'string') throw new TypeError('commandTypes argument must be either a String or an Array');

		super();

		this._eventStore = eventStore;
		this._commandTypes = typeof commandTypes === 'string' ? Array.from(arguments).slice(1) : Array.from(commandTypes);
	}

	getAggregate(aggregateId, events) {
		throw new Error('getAggregate(aggregateId, events) is not defined on command handler');
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

		this.debug('execute \'%s\'', cmd && cmd.type);
		validate.object(cmd, 'cmd');
		validate.string(cmd.type, 'cmd.type');
		validate.context(cmd.context);

		return Promise.resolve(cmd.aggregateId)
			.then(restoreAggregate(this._eventStore, this.getAggregate.bind(this)))
			.then(this._log(aggregate => 'aggregate ' + aggregate.id + ' v.' + aggregate.version + ' is restored'))
			.then(passCommandToAggregate(cmd))
			.then(commitAggregateEvents(this._eventStore, cmd.context))
			.then(this._log(changes => 'command \'' + cmd.type + '\' executed, ' + changes.length + ' event(s) produced'));
	}

	_log(messageFormat) {
		return arg => {
			this.debug(typeof messageFormat === 'function' ? messageFormat(arg) : messageFormat);
			return arg;
		};
	}
}

module.exports = AbstractCommandHandler;
