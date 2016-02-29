'use strict';

const Observer = require('./Observer');

function restoreSagaState(sagaId, eventStore, SagaType, triggeredBy) {
	if (!eventStore) throw new TypeError('eventStore argument required');
	if (!SagaType) throw new TypeError('SagaType argument required');

	if (sagaId) {
		return eventStore.getSagaEvents(sagaId, { except: triggeredBy }).then(events => new SagaType({
			id: sagaId,
			events: events
		}));
	} else {
		return eventStore.getNewId().then(sagaId => new SagaType({
			id: sagaId
		}));
	}
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

		this._sagaType = options.sagaType;
		this._eventStore = options.eventStore;
		this._commandBus = options.commandBus;

		this.subscribe(options.eventStore);
	}

	subscribe(eventStore) {
		super.subscribe(eventStore, this._sagaType.handles, this.handle);
	}

	handle(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');
		// event._id is not required since saga can be started by non-persistent event
		// if (!event._id) throw new TypeError('event._id argument required');

		return restoreSagaState(event.sagaId, this._eventStore, this._sagaType, event._id)
			.then(saga => {
				this.debug(`saga ${saga.id} (v${saga.version}) restored`);

				saga.apply(event);

				// sign commands
				const commands = saga.uncommittedMessages;
				commands.forEach(c => {
					c.sagaId = saga.id;
					c.context = event.context;
				});
				return commands;
			})
			.then(sendCommands(this._commandBus))
			.then(results => {
				this.debug(`event '${event.type}' handled, ${results.length === 1 ? '1 command' : results.length + ' commands'} produced`);
				return results;
			});
	}
};
