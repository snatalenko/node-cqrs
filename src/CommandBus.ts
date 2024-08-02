import {
	ICommand,
	ICommandBus,
	IEventSet,
	IExtendableLogger,
	ILogger,
	IMessageBus,
	IMessageHandler
} from "./interfaces";

export class CommandBus implements ICommandBus {

	#logger?: ILogger;
	#bus: IMessageBus;

	/**
	 * Creates an instance of CommandBus.
	 */
	constructor({ messageBus, logger }: {
		messageBus: IMessageBus,
		logger?: ILogger | IExtendableLogger
	}) {
		if (!messageBus)
			throw new TypeError('messageBus argument required');

		this.#bus = messageBus;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: 'CommandBus' }) :
			logger;
	}

	/**
	 * Set up a command handler
	 */
	on(commandType: string, handler: IMessageHandler) {
		if (typeof commandType !== 'string' || !commandType.length)
			throw new TypeError('commandType argument must be a non-empty String');
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');

		return this.#bus.on(commandType, handler);
	}

	/**
	 * Remove previously installed command handler
	 */
	off(commandType: string, handler: IMessageHandler) {
		if (typeof commandType !== 'string' || !commandType.length)
			throw new TypeError('commandType argument must be a non-empty String');
		if (typeof handler !== 'function')
			throw new TypeError('handler argument must be a Function');

		return this.#bus.off(commandType, handler);
	}

	/**
	 * Format and send a command for execution
	 */
	send<TPayload>(type: string, aggregateId: string, options: { payload: TPayload, context: object }, ...otherArgs: object[]): Promise<IEventSet> {
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

		return this.sendRaw<TPayload>({ type, aggregateId, ...options });
	}

	/**
	 * Send a command for execution
	 */
	sendRaw<TPayload>(command: ICommand<TPayload>): Promise<IEventSet> {
		if (!command)
			throw new TypeError('command argument required');
		if (!command.type)
			throw new TypeError('command.type argument required');

		this.#logger?.debug(`sending '${command.type}' command${command.aggregateId ? ` to ${command.aggregateId}` : ''}...`);

		return this.#bus.send(command).then(r => {
			this.#logger?.debug(`'${command.type}' ${command.aggregateId ? `on ${command.aggregateId}` : ''} processed`);
			return r;
		}, error => {
			this.#logger?.warn(`'${command.type}' ${command.aggregateId ? `on ${command.aggregateId}` : ''} processing has failed: ${error.message}`, {
				stack: error.stack
			});
			throw error;
		});
	}
}
