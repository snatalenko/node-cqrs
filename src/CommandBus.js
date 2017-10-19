'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const debug = require('debug')('cqrs:debug:CommandBus');
const info = require('debug')('cqrs:info:CommandBus');

module.exports = class CommandBus {

	/**
	 * Creates an instance of CommandBus.
	 *
	 * @param {{ messageBus: IMessageBus }} options
	 */
	constructor(options) {
		this._bus = (options && options.messageBus) || new InMemoryBus();
	}

	/**
	 * Set up a command handler
	 *
	 * @param {string} commandType
	 * @param {function} handler
	 * @returns {any}
	 */
	on(commandType, handler) {
		if (typeof commandType !== 'string' || !commandType.length) throw new TypeError('commandType argument must be a non-empty String');
		if (typeof handler !== 'function') throw new TypeError('handler argument must be a Function');

		return this._bus.on(commandType, handler);
	}

	/**
	 * Format and send a command for execution
	 *
	 * @param {string} type
	 * @param {string} aggregateId
	 * @param {{ payload: object, context: object }} options
	 * @param {...object} otherArgs
	 * @returns {Promise<IEvent>} - produced events
	 */
	send(type, aggregateId, options, ...otherArgs) {
		if (typeof type !== 'string' || !type.length) throw new TypeError('type argument must be a non-empty String');
		if (typeof options !== 'object' || !options) throw new TypeError('options argument must be an Object');
		if (otherArgs.length > 1) throw new TypeError('more than expected arguments supplied');

		// obsolete. left for backward compatibility
		if (otherArgs.length || (!('context' in options) && !('payload' in options))) {
			const context = options;
			const payload = otherArgs.length ? otherArgs[0] : undefined;
			return this.sendRaw({ type, aggregateId, context, payload });
		}

		return this.sendRaw(Object.assign({ type, aggregateId }, options));
	}

	/**
	 * Send a command for execution
	 *
	 * @param {ICommand} command
	 * @returns {Promise<IEvent>} - produced events
	 */
	sendRaw(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		debug(`sending '${command.type}' command...`);

		return this._bus.send(command).then(r => {
			debug(`'${command.type}' processed`);
			return r;
		}, err => {
			info(`'${command.type}' processing has failed: ${err}`);
			throw err;
		});
	}
};
