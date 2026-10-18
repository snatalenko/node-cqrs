import type { IContainer } from 'node-cqrs';
import {
	type DispatchPipelineBatch,
	type IDispatchPipelineProcessor,
	type IEvent,
	type IEventDispatcher,
	type EventFeedParams,
	type IEventFeed,
	type ILogger,
	type IMessage,
	type IMessageMeta,
	DEFAULT_EVENT_FEED_ORIGIN,
	isSnapshotEvent
} from '../interfaces/index.ts';
import { assertBoolean, assertDefined, assertFunction, assertNonNegativeInteger, assertString } from '../utils/index.ts';
import { EventStore } from '../EventStore.ts';
import { RabbitMqEventBus } from './RabbitMqEventBus.ts';
import { RabbitMqGateway, type Subscription } from './RabbitMqGateway.ts';
import { type ConfigProvider, resolveProvider } from './utils/index.ts';

type RabbitMqEventBridgeSubscriptionConfig = Partial<Pick<Subscription,
	'exchange' | 'queueName' | 'concurrentLimit' | 'handlerProcessTimeout' | 'queueExpires' | 'deadLetterQueue' |
	'messageTtl'>>;

export type RabbitMqEventBridgeConfig = RabbitMqEventBridgeSubscriptionConfig & {

	/**
	 * When `true`, a failed publish rejects the dispatch pipeline, so the event does not reach the event bus.
	 * Otherwise the failure is passed to the publish error handler and the dispatch continues.
	 *
	 * @default false
	 */
	throwOnPublishError?: boolean
};

type ResolvedRabbitMqEventBridgeConfig = {
	subscription: RabbitMqEventBridgeSubscriptionConfig & Required<Pick<Subscription, 'exchange'>>,
	throwOnPublishError: boolean
};

async function resolveConfig(provider?: ConfigProvider<RabbitMqEventBridgeConfig>):
	Promise<ResolvedRabbitMqEventBridgeConfig> {
	const {
		exchange = RabbitMqEventBus.DEFAULT_EXCHANGE,
		queueName,
		concurrentLimit,
		handlerProcessTimeout,
		queueExpires,
		deadLetterQueue = false,
		messageTtl,
		throwOnPublishError = false
	} = await resolveProvider(provider) ?? {};

	assertString(exchange, 'rabbitMqEventBridgeConfig.exchange');
	if (queueName !== undefined)
		assertString(queueName, 'rabbitMqEventBridgeConfig.queueName');
	if (concurrentLimit !== undefined)
		assertNonNegativeInteger(concurrentLimit, 'rabbitMqEventBridgeConfig.concurrentLimit');
	if (handlerProcessTimeout !== undefined)
		assertNonNegativeInteger(handlerProcessTimeout, 'rabbitMqEventBridgeConfig.handlerProcessTimeout');
	if (queueExpires !== undefined)
		assertNonNegativeInteger(queueExpires, 'rabbitMqEventBridgeConfig.queueExpires');
	assertBoolean(deadLetterQueue, 'rabbitMqEventBridgeConfig.deadLetterQueue');
	if (messageTtl !== undefined)
		assertNonNegativeInteger(messageTtl, 'rabbitMqEventBridgeConfig.messageTtl');
	assertBoolean(throwOnPublishError, 'rabbitMqEventBridgeConfig.throwOnPublishError');

	return {
		subscription: {
			exchange,
			queueName,
			concurrentLimit,
			handlerProcessTimeout,
			queueExpires,
			deadLetterQueue,
			messageTtl
		},
		throwOnPublishError
	};
}

/**
 * Delivers events between application instances sharing an event store that cannot notify about new commits.
 *
 * As a dispatch pipeline processor placed after event storage, publishes events committed by this instance
 * to a RabbitMQ exchange. As an event feed, consumes events published by other instances.
 * Register one instance in both roles:
 *
 * @example
 * builder.registerEventFeed(RabbitMqEventBridge).as('rabbitMqEventBridge');
 * builder.register(c => [...c.defaultEventDispatchPipeline, c.rabbitMqEventBridge!]).as('eventDispatchPipeline');
 *
 * Publishing is awaited before the event reaches the local event bus. A failed publish is passed to
 * `eventPublishErrorHandler` (logged by default) and the dispatch continues, unless the handler throws or
 * `throwOnPublishError` is set: then the dispatch is rejected and the event is not distributed further.
 * An event committed but not published because the process stops is not delivered to other instances
 * until they restore their projections.
 */
export class RabbitMqEventBridge implements IDispatchPipelineProcessor, IEventFeed {

	readonly #gateway: RabbitMqGateway;
	readonly #configProvider?: ConfigProvider<RabbitMqEventBridgeConfig>;
	readonly #onPublishError: (error: Error) => void;
	readonly #feedOrigin: string;
	readonly #getEventDispatcher: () => IEventDispatcher | undefined;
	#config?: Promise<ResolvedRabbitMqEventBridgeConfig>;
	#subscription?: Subscription;

	constructor({
		rabbitMqGateway,
		rabbitMqEventBridgeConfig,
		eventPublishErrorHandler,
		eventFeedOrigin = DEFAULT_EVENT_FEED_ORIGIN,
		get,
		logger
	}: Pick<IContainer, 'rabbitMqGateway' | 'rabbitMqEventBridgeConfig' | 'logger' | 'get'> & EventFeedParams & {
		eventPublishErrorHandler?: (error: Error) => void
	}) {
		assertDefined(rabbitMqGateway, 'rabbitMqGateway');
		assertString(eventFeedOrigin, 'eventFeedOrigin');
		assertFunction(get, 'get');

		this.#feedOrigin = eventFeedOrigin;

		// resolved lazily, since the bridge is also a processor of the dispatcher pipelines
		this.#getEventDispatcher = () => get('eventDispatcher') as IEventDispatcher | undefined;

		const log: ILogger | undefined = logger && 'child' in logger ?
			logger.child({ service: new.target.name }) :
			logger;

		this.#gateway = rabbitMqGateway;
		this.#configProvider = rabbitMqEventBridgeConfig;
		this.#onPublishError = eventPublishErrorHandler ??
			(error => log?.error('event could not be published to RabbitMQ', { error }));
	}

	#resolveConfig(): Promise<ResolvedRabbitMqEventBridgeConfig> {
		this.#config ??= resolveConfig(this.#configProvider);
		return this.#config;
	}

	/**
	 * Publishes events of the batch in order, awaiting broker confirms.
	 * A failed publish is passed to the publish error handler, or rejects the batch with `throwOnPublishError`;
	 * an error thrown by the handler rejects the batch as well.
	 * Throws when the batch contains events with an origin other than `EventStore.DEFAULT_ORIGIN`,
	 * such as events delivered by event feeds, which must not be published again.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const foreignOrigin = batch.find(e => e.origin !== undefined && e.origin !== EventStore.DEFAULT_ORIGIN)?.origin;
		if (foreignOrigin !== undefined) {
			throw new Error(`RabbitMqEventBridge publishes only "${EventStore.DEFAULT_ORIGIN}"-originated events, ` +
				`received "${foreignOrigin}"`);
		}

		const { subscription: { exchange }, throwOnPublishError } = await this.#resolveConfig();

		for (const { event, ...meta } of batch) {
			if (!event || isSnapshotEvent(event))
				continue;

			try {
				await this.#gateway.publish(exchange, event, meta);
			}
			catch (error: any) {
				if (throwOnPublishError)
					throw error;

				this.#onPublishError(error);
			}
		}

		return batch;
	}

	/**
	 * Consumes events published by other instances and dispatches them with the feed origin,
	 * acknowledging each message once it is dispatched
	 */
	async startEventFeed(): Promise<void> {
		if (this.#subscription)
			return;

		const eventDispatcher = this.#getEventDispatcher();
		if (!eventDispatcher)
			throw new Error('eventDispatcher is required to start the event feed');

		const { subscription: subscriptionConfig } = await this.#resolveConfig();
		const subscription: Subscription = {
			...subscriptionConfig,
			eventType: RabbitMqGateway.ALL_EVENTS_WILDCARD,
			ignoreOwn: true,
			handler: (message: IMessage, meta?: IMessageMeta) =>
				eventDispatcher.dispatch([message as IEvent], { ...meta, origin: this.#feedOrigin })
		};

		this.#subscription = subscription;
		try {
			await this.#gateway.subscribe(subscription);
		}
		catch (error) {
			this.#subscription = undefined;
			throw error;
		}
	}

	async stopEventFeed(): Promise<void> {
		const subscription = this.#subscription;
		if (!subscription)
			return;

		this.#subscription = undefined;
		await this.#gateway.unsubscribe(subscription);
	}
}
