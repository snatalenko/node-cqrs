'use strict';

const utils = require('./utils');
const validate = require('./validate');

const KEY_HANDLERS = Symbol();

class CommandBus {

	get handlers() {
		return this[KEY_HANDLERS];
	}

	constructor() {
		this[KEY_HANDLERS] = {};
	}

	on(commandType, handler, context) {
		validate.string(commandType, 'commandType');
		validate.func(handler, 'handler');
		if (commandType in this.handlers) throw new Error('\'' + commandType + '\' handler is already set up');

		this.handlers[commandType] = context ? handler.bind(context) : handler;
	}

	send(commandType, aggregateId, context, payload) {
		validate.string(commandType, 'commandType');
		validate.context(context);

		if (typeof context.uid === 'object') {
			context.uid = context.uid.toString();
		}

		return utils.passToHandler(this.handlers, commandType, {
			type: commandType,
			aggregateId: aggregateId,
			context: context,
			payload: payload
		});
	}
}

module.exports = CommandBus;
