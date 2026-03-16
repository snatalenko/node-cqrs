import type { Tracer } from '@opentelemetry/api';
import { InMemoryMessageBus } from './in-memory/index.ts';
import type {
	ICommand,
	ICommandBus,
	IContainer,
	Identifier,
	IEventSet,
	ILogger,
	IMessageBus,
	IMessageHandler,
	IMessageMeta
} from './interfaces/index.ts';
import { assertString, assertFunction, assertMessage, assertObject } from './utils/index.ts';
import { recordSpanError, spanAttributes, spanContext } from './telemetry/index.ts';


export class CommandBus implements ICommandBus {

	readonly #logger?: ILogger;
	readonly #bus: IMessageBus;
	readonly #tracer: Tracer | undefined;

	constructor(o?: Pick<IContainer, 'logger' | 'tracerFactory'> & {
		messageBus?: IMessageBus
	}) {
		this.#bus = o?.messageBus ?? new InMemoryMessageBus();
		this.#tracer = o?.tracerFactory?.(new.target.name);

		this.#logger = o?.logger && 'child' in o.logger ?
			o.logger.child({ service: new.target.name }) :
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

		return this.sendRaw<TPayload>({ type, aggregateId, ...options } as ICommand<TPayload>);
	}

	/**
	 * Send a command for execution
	 */
	sendRaw<TPayload>(command: ICommand<TPayload>, meta?: IMessageMeta): Promise<IEventSet> {
		assertMessage(command, 'command');

		this.#logger?.debug(`sending '${command.type}' command${command.aggregateId ? ` to ${command.aggregateId}` : ''}...`);

		const span = this.#tracer?.startSpan(`CommandBus.send ${command.type}`,
			spanAttributes('command', command, ['type', 'aggregateId']),
			spanContext(meta)
		);

		return this.#bus.send(command, { span }).then(r => {
			this.#logger?.debug(`'${command.type}' ${command.aggregateId ? `on ${command.aggregateId}` : ''} processed`);
			return r;
		}, error => {
			this.#logger?.warn(`'${command.type}' ${command.aggregateId ? `on ${command.aggregateId}` : ''} processing has failed: ${error.message}`, {
				stack: error.stack
			});
			recordSpanError(span, error);
			throw error;
		}).finally(() => {
			span?.end();
		});
	}
}
