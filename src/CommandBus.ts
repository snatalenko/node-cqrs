import { InMemoryMessageBus } from './in-memory/index.ts';
import type {
	ICommand,
	ICommandBus,
	Identifier,
	IEventSet,
	IExtendableLogger,
	ILogger,
	IMessageBus,
	IMessageHandler
} from './interfaces/index.ts';
import { assertString, assertFunction, assertMessage, assertObject } from './utils/index.ts';

export class CommandBus implements ICommandBus {

	#logger?: ILogger;
	#bus: IMessageBus;

	constructor(o?: {
		messageBus?: IMessageBus,
		logger?: ILogger | IExtendableLogger
	}) {
		this.#bus = o?.messageBus ?? new InMemoryMessageBus();

		this.#logger = o?.logger && 'child' in o.logger ?
			o.logger.child({ service: 'CommandBus' }) :
			o?.logger;
	}

	/**
	 * Set up a command handler
	 */
	on(commandType: string, handler: IMessageHandler) {
		assertString(commandType, 'commandType');
		assertFunction(handler, 'handler');

		return this.#bus.on(commandType, handler);
	}

	/**
	 * Remove previously installed command handler
	 */
	off(commandType: string, handler: IMessageHandler) {
		assertString(commandType, 'commandType');
		assertFunction(handler, 'handler');

		return this.#bus.off(commandType, handler);
	}

	/**
	 * Format and send a command for execution
	 */
	send<TPayload>(
		type: string,
		aggregateId?: string,
		options?: {
			payload?: TPayload,
			context?: object
		}
	): Promise<IEventSet>;

	/**
	 * Format and send a command for execution (obsolete signature)
	 *
	 * @deprecated Use `send(type, aggregateId, { context, payload })`
	 */
	send<TPayload>(
		type: string,
		aggregateId?: string,
		context?: object,
		payload?: TPayload
	): Promise<IEventSet>;

	send<TPayload>(
		type: string,
		aggregateId?: Identifier,
		options?: {
			payload?: TPayload,
			context?: object
		} | object,
		payload?: TPayload
	): Promise<IEventSet> {
		assertString(type, 'type');
		if (options !== undefined)
			assertObject(options, 'options');

		// obsolete. left for backward compatibility
		const isOptionsObject = !!options && ('context' in options || 'payload' in options);
		if (!isOptionsObject) {
			const context = options;
			return this.sendRaw({ type, aggregateId, context, payload });
		}

		if (payload !== undefined)
			throw new TypeError('more than expected arguments supplied');

		return this.sendRaw<TPayload>({ type, aggregateId, ...options } as ICommand<TPayload>);
	}

	/**
	 * Send a command for execution
	 */
	sendRaw<TPayload>(command: ICommand<TPayload>): Promise<IEventSet> {
		assertMessage(command, 'command');

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
