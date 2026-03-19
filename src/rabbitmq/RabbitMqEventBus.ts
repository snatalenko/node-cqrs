import type { IContainer } from 'node-cqrs';
import type { IEventBus, IMessage, IMessageHandler, IObservable, IObservableQueueProvider } from '../interfaces/index.ts';
import { assertBoolean, assertDefined, assertNonNegativeInteger, assertString } from '../utils/index.ts';
import { RabbitMqCommandBus } from './RabbitMqCommandBus.ts';
import { RabbitMqGateway, type Subscription, type SubscribeResult } from './RabbitMqGateway.ts';
import { type ConfigProvider, resolveProvider } from './utils/index.ts';

export type RabbitMqEventBusConfig = Partial<Pick<Subscription,
	'exchange' | 'queueName' | 'ignoreOwn' | 'concurrentLimit' | 'handlerProcessTimeout' | 'queueExpires'>>;

type ResolvedRabbitMqEventBusConfig = RabbitMqEventBusConfig
	& Required<Pick<RabbitMqEventBusConfig, 'exchange' | 'ignoreOwn'>>;

async function resolveConfig(provider?: ConfigProvider<RabbitMqEventBusConfig>) {
	const {
		// eslint-disable-next-line no-use-before-define
		exchange = RabbitMqEventBus.DEFAULT_EXCHANGE,
		ignoreOwn = true,
		concurrentLimit,
		handlerProcessTimeout,
		queueName,
		queueExpires
	} = await resolveProvider(provider) ?? {};

	assertString(exchange, 'rabbitMqEventConfig.exchange');
	assertBoolean(ignoreOwn, 'rabbitMqEventConfig.ignoreOwn');
	if (concurrentLimit !== undefined)
		assertNonNegativeInteger(concurrentLimit, 'rabbitMqEventConfig.concurrentLimit');
	if (handlerProcessTimeout !== undefined)
		assertNonNegativeInteger(handlerProcessTimeout, 'rabbitMqEventConfig.handlerProcessTimeout');
	if (queueName !== undefined)
		assertString(queueName, 'rabbitMqEventConfig.queueName');
	if (queueExpires !== undefined)
		assertNonNegativeInteger(queueExpires, 'rabbitMqEventConfig.queueExpires');

	return { exchange, ignoreOwn, concurrentLimit, handlerProcessTimeout, queueName, queueExpires };
}

/**
 * RabbitMQ-backed event bus: delivers each published message
 * to all subscribers.
 *
 * By default uses an exclusive (non-durable) queue per connection.
 * Set `queueName` in config for a durable queue that survives restarts.
 *
 * Optionally ignores messages published by this instance (default: true).
 *
 * Supports named durable queues via {@link queue} for single-consumer delivery.
 */
export class RabbitMqEventBus implements IEventBus, IObservableQueueProvider {

	static get allEventsWildcard(): string {
		return RabbitMqGateway.ALL_EVENTS_WILDCARD;
	}

	static DEFAULT_EXCHANGE = 'node-cqrs.events';

	readonly #gateway: RabbitMqGateway;
	readonly #queues = new Map<string, RabbitMqCommandBus>();
	readonly #configProvider?: ConfigProvider<RabbitMqEventBusConfig>;
	#config?: ResolvedRabbitMqEventBusConfig;

	constructor({
		rabbitMqGateway,
		rabbitMqEventBusConfig
	}: Pick<IContainer, 'rabbitMqGateway' | 'rabbitMqEventBusConfig'>) {
		assertDefined(rabbitMqGateway, 'rabbitMqGateway');

		this.#gateway = rabbitMqGateway;
		this.#configProvider = rabbitMqEventBusConfig;
	}

	async #resolveConfig(): Promise<ResolvedRabbitMqEventBusConfig> {
		this.#config ??= await resolveConfig(this.#configProvider);
		return this.#config;
	}

	/**
	 * Publishes a message to the event exchange.
	 * The message will be delivered to all subscribers.
	 */
	async publish(message: IMessage): Promise<void> {
		const { exchange } = await this.#resolveConfig();
		await this.#gateway.publish(exchange, message);
	}

	/**
	 * Registers a message handler for a specific message type.
	 *
	 * When `queueName` is set in config, uses a durable queue
	 * that survives broker restarts. Otherwise uses an exclusive
	 * (non-durable) queue that is deleted on disconnect.
	 */
	async on(eventType: string, handler: IMessageHandler): Promise<SubscribeResult> {
		const { exchange, queueName, ignoreOwn, concurrentLimit, handlerProcessTimeout, queueExpires } =
			await this.#resolveConfig();

		return this.#gateway.subscribe({
			exchange,
			queueName,
			eventType,
			handler,
			ignoreOwn,
			concurrentLimit,
			handlerProcessTimeout,
			queueExpires,
			singleActiveConsumer: true
		});
	}

	/**
	 * Removes a previously registered message handler for a specific message type.
	 */
	async off(eventType: string, handler: IMessageHandler): Promise<void> {
		const { exchange, queueName } = await this.#resolveConfig();

		await this.#gateway.unsubscribe({
			exchange,
			queueName,
			eventType,
			handler
		});
	}

	/**
	 * Returns a {@link RabbitMqCommandBus} that uses a durable queue with the given name.
	 * Messages published to the event exchange are also delivered to this queue,
	 * but only one consumer will process each message.
	 */
	queue(queueName: string): IObservable {
		let queue = this.#queues.get(queueName);
		if (!queue) {
			queue = new RabbitMqCommandBus({
				rabbitMqGateway: this.#gateway,
				rabbitMqCommandBusConfig: async () => {
					const { exchange, concurrentLimit, handlerProcessTimeout, queueExpires } =
						await this.#resolveConfig();

					return {
						exchange,
						queueName,
						concurrentLimit,
						handlerProcessTimeout,
						queueExpires
					};
				}
			});
			this.#queues.set(queueName, queue);
		}
		return queue;
	}
}
