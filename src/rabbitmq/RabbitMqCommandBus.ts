import type { IContainer } from 'node-cqrs';
import type { ICommand, ICommandBus, IMessage, IMessageHandler, IMessageMeta } from '../interfaces/index.ts';
import { assertBoolean, assertDefined, assertMessage, assertNonNegativeInteger, assertString } from '../utils/index.ts';
import { RabbitMqGateway, type Subscription } from './RabbitMqGateway.ts';
import { type ConfigProvider, resolveProvider } from './utils/index.ts';

export type RabbitMqCommandBusConfig = Partial<Pick<Subscription,
	'exchange' | 'queueName' | 'ignoreOwn' | 'concurrentLimit' | 'handlerProcessTimeout' | 'queueExpires'>>;

type ResolvedRabbitMqCommandBusConfig = RabbitMqCommandBusConfig
	& Required<Pick<RabbitMqCommandBusConfig, 'exchange' | 'queueName' | 'ignoreOwn'>>;

async function resolveConfig(provider?: ConfigProvider<RabbitMqCommandBusConfig>) {
	const {
		// eslint-disable-next-line no-use-before-define
		exchange = RabbitMqCommandBus.DEFAULT_EXCHANGE,
		ignoreOwn = false,
		concurrentLimit,
		handlerProcessTimeout,
		queueName,
		queueExpires
	} = await resolveProvider(provider) ?? {};

	assertString(exchange, 'rabbitMqCommandConfig.exchange');
	assertString(queueName, 'rabbitMqCommandConfig.queueName');
	assertBoolean(ignoreOwn, 'rabbitMqCommandConfig.ignoreOwn');
	if (concurrentLimit !== undefined)
		assertNonNegativeInteger(concurrentLimit, 'rabbitMqCommandConfig.concurrentLimit');
	if (handlerProcessTimeout !== undefined)
		assertNonNegativeInteger(handlerProcessTimeout, 'rabbitMqCommandConfig.handlerProcessTimeout');
	if (queueExpires !== undefined)
		assertNonNegativeInteger(queueExpires, 'rabbitMqCommandConfig.queueExpires');

	return { exchange, queueName, ignoreOwn, concurrentLimit, handlerProcessTimeout, queueExpires };
}

/**
 * RabbitMQ-backed command bus: delivers each message to exactly
 * one consumer via a durable named queue.
 *
 * Used for point-to-point command delivery or durable event processing.
 */
export class RabbitMqCommandBus implements ICommandBus {

	static DEFAULT_EXCHANGE = 'node-cqrs.commands';

	readonly #gateway: RabbitMqGateway;
	readonly #configProvider?: ConfigProvider<RabbitMqCommandBusConfig>;
	#config?: ResolvedRabbitMqCommandBusConfig;

	constructor({
		rabbitMqGateway,
		rabbitMqCommandBusConfig
	}: Pick<IContainer, 'rabbitMqGateway' | 'rabbitMqCommandBusConfig'>) {
		assertDefined(rabbitMqGateway, 'rabbitMqGateway');

		this.#gateway = rabbitMqGateway;
		this.#configProvider = rabbitMqCommandBusConfig;
	}

	async #resolveConfig(): Promise<ResolvedRabbitMqCommandBusConfig> {
		this.#config ??= await resolveConfig(this.#configProvider);
		return this.#config;
	}

	/**
	 * Format and send a command for execution
	 */
	send(commandType: string, aggregateId?: string, options?: { payload?: object, context?: object } & IMessageMeta):
		Promise<any>;

	/**
	 * Sends a pre-built command to the exchange, routed to the durable queue.
	 * Exactly one consumer will process it.
	 */
	send(command: ICommand, meta?: IMessageMeta): Promise<any>;

	async send(
		commandOrType: ICommand | string,
		aggregateIdOrMeta?: string | IMessageMeta,
		options?: { payload?: object, context?: object } & IMessageMeta
	): Promise<any> {
		let command: IMessage;
		let meta: IMessageMeta | undefined;

		if (typeof commandOrType === 'string') {
			const { span, ...commandOptions } = options ?? {};
			command = { type: commandOrType, aggregateId: aggregateIdOrMeta as string | undefined, ...commandOptions };
			if (span)
				meta = { span };
		}
		else {
			command = commandOrType;
			if (aggregateIdOrMeta && typeof aggregateIdOrMeta === 'object')
				meta = aggregateIdOrMeta as IMessageMeta;
		}

		assertMessage(command, 'command');

		const { exchange } = await this.#resolveConfig();
		await this.#gateway.publish(exchange, command, meta);
	}

	/** @deprecated Use {@link send} */
	sendRaw(command: ICommand, meta?: IMessageMeta): Promise<any> {
		return this.send(command, meta);
	}

	/**
	 * Registers a message handler for a specific message type on the durable queue.
	 * Only one consumer receives each message.
	 */
	async on(messageType: string, handler: IMessageHandler): Promise<void> {
		const { exchange, queueName, ignoreOwn, concurrentLimit, handlerProcessTimeout, queueExpires } =
			await this.#resolveConfig();

		await this.#gateway.subscribe({
			exchange,
			queueName,
			eventType: messageType,
			handler,
			ignoreOwn,
			concurrentLimit,
			handlerProcessTimeout,
			queueExpires
		});
	}

	/**
	 * Removes a previously registered message handler.
	 */
	async off(messageType: string, handler: IMessageHandler): Promise<void> {
		const { exchange, queueName } = await this.#resolveConfig();

		await this.#gateway.unsubscribe({
			exchange,
			queueName,
			eventType: messageType,
			handler
		});
	}
}
