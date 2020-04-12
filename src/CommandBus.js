'use strict';

const InMemoryBus = require('./infrastructure/InMemoryMessageBus');
const nullLogger = require('./utils/nullLogger');
const service = 'CommandBus';

/**
 * @class CommandBus
 * @implements {ICommandBus}
 */
class CommandBus {

	/**
	 * Creates an instance of CommandBus.
	 *
	 * @param {object} [options]
	 * @param {IMessageBus} [options.messageBus]
	 * @param {ILogger} [options.logger]
	 */
	constructor(options) {
		this._bus = (options && options.messageBus) || new InMemoryBus();
		this._logger = (options && options.logger) || nullLogger;
	}

	/**
	 * Set up a command handler
	 *
	 * @param {string} commandType
	 * @param {IMessageHandler} handler
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
	 * @param {string} [aggregateId]
	 * @param {object} [options]
	 * @param {any} [options.payload]
	 * @param {object} [options.context]
	 * @param {...object} [otherArgs]
	 * @returns {Promise<IEventStream>} - produced events
	 */
	send(type, aggregateId, options, ...otherArgs) {
		if (typeof type !== 'string' || !type.length)
			throw new TypeError('type argument must be a non-empty String');
		if (options && typeof options !== 'object')
			throw new TypeError('options argument, when defined, must be an Object');
		if (otherArgs.length > 1)
			throw new TypeError('more than expected arguments supplied');

		// obsolete. left for backward compatibility
		const optionsContainContext = options && !('context' in options) && !('payload' in options);
		if (otherArgs.length || optionsContainContext) {
			const context = options;
			const payload = otherArgs.length ? otherArgs[0] : undefined;
			return this.sendRaw({ type, aggregateId, context, payload });
		}

		return this.sendRaw({ type, aggregateId, ...options });
	}

	/**
	 * Send a command for execution
	 *
	 * @param {ICommand} command
	 * @returns {Promise<IEventStream>} - produced events
	 */
	sendRaw(command) {
		if (!command) throw new TypeError('command argument required');
		if (!command.type) throw new TypeError('command.type argument required');

		this._logger.log('debug', `sending '${command.type}' command...`, { service });

		return this._bus.send(command).then(r => {
			this._logger.log('debug', `'${command.type}' processed`, { service });
			return r;
		}, error => {
			this._logger.log('error', `'${command.type}' processing has failed: ${error.message}`, { service, stack: error.stack });
			throw error;
		});
	}
}

module.exports = CommandBus;
