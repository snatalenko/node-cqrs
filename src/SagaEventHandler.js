'use strict';

const Observer = require('./Observer');

function restoreSagaState(sagaId, eventStore, sagaTypeOrFactory, triggeredBy) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (!sagaTypeOrFactory) throw new TypeError('sagaTypeOrFactory argument required');

	const sagaFactory = sagaTypeOrFactory.prototype ?
		options => new sagaTypeOrFactory(options) :
		sagaTypeOrFactory;

	if (sagaId) {
		return eventStore.getSagaEvents(sagaId, { except: triggeredBy }).then(events => sagaFactory({
			id: sagaId,
			events: events
		}));
	}
	else {
		return eventStore.getNewId().then(sagaId => sagaFactory({
			id: sagaId
		}));
	}
}

function signCommandsContext(context) {
	return commands => {
		commands.forEach(command => command.context = context);
		return commands;
	};
}

function sendCommands(commandBus) {
	if (!commandBus) throw new TypeError('commandBus argument required');

	return commands => Promise.all(
		commands.map(command =>
			commandBus.sendRaw(command)));
}

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
module.exports = class SagaEventHandler extends Observer {

	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.sagaType) throw new TypeError('options.sagaType argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.commandBus) throw new TypeError('options.commandBus argument required');

		super();

		this._sagaTypeOrFactory = options.sagaType;
		this._eventStore = options.eventStore;
		this._commandBus = options.commandBus;
		this._handles = options.handles || options.sagaType.handles;
	}

	subscribe(eventStore) {
		return super.subscribe(eventStore, this._handles, this.handle);
	}

	handle(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');
		// event._id is not required since saga can be started by non-persistent event
		// if (!event.id) throw new TypeError('event.id argument required');

		return restoreSagaState(event.sagaId, this._eventStore, this._sagaTypeOrFactory, event.id)
			.then(saga => {
				this.debug(`saga ${saga.id} (v${saga.version}) restored`);

				saga.apply(event);

				return saga.uncommittedMessages;
			})
			.then(signCommandsContext(event.context))
			.then(sendCommands(this._commandBus))
			.then(results => {
				this.debug(`event '${event.type}' handled, ${results.length === 1 ? '1 command' : results.length + ' commands'} produced`);
				return results;
			});
	}
};
