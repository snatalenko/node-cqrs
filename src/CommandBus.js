'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs-framework:CommandBus');

module.exports = class CommandBus {

	constructor(options) {
		this._bus = options && options.messageBus || new InMemoryBus();
	}

	on(commandType, handler, context) {
		return this._bus.on(commandType, context ? handler.bind(context) : handler);
	}

	send(commandType, aggregateId, context, payload) {
		if (typeof commandType !== 'string' || !commandType.length) throw new TypeError('commandType argument must be a non-empty String');
		if (!context) throw new TypeError('context argument required');
		if (!context.ip) throw new TypeError('context.ip argument required');
		if (!context.browser) throw new TypeError('context.browser argument required');

		if (typeof context.uid === 'object') {
			context.uid = context.uid.toString();
		}

		return this.sendRaw({
			type: commandType,
			aggregateId: aggregateId,
			context: context,
			payload: payload
		});
	}

	sendRaw(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		debug(`sending ${command.type}...`);

		return this._bus.send(command);
	}
};
