import { Channel, ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
	IExtendableLogger,
	ILogger,
	IMessage,
	isMessage
} from '../interfaces';
import * as Event from '../Event';
import { delay } from '../utils';

/** Generate a short pseudo-unique identifier using a truncated timestamp and random component */
const getRandomAppId = () =>
	`${Date.now().toString(36).slice(-4)}.${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

type MessageHandler = (m: IMessage) => Promise<unknown> | unknown;
type Subscription = {
	exchange: string,
	queueName?: string,
	eventType?: string,
	handler: MessageHandler,
	ignoreOwn?: boolean,
	concurrentLimit?: number
};

const isSystemQueue = (queueName: string) => queueName.startsWith('amq.');

/**
 * RabbitMqGateway implements the IObservable interface using RabbitMQ.
 *
 * It uses a fanout exchange to broadcast messages to all connected subscribers.
 * The `on` and `off` methods allow you to register and remove handlers for specific event types.
 * The `queue(name)` method creates or returns a durable queue with the given name, ensuring that
 * all messages delivered to the fanout exchange are also routed to this queue.
 */
export class RabbitMqGateway {

	#connectionFactory: () => Promise<ChannelModel>;
	#appId: string;
	#logger: ILogger | undefined;

	#connecting = false;
	#connection: ChannelModel | undefined;
	#pubChannel: ConfirmChannel | undefined;
	#exclusiveQueueName: string | undefined;
	#queueChannels = new Map<string, Channel>();
	#queueConsumers = new Map<string, string>();

	#subscriptions: Array<Subscription & { queueGivenName: string }> = [];
	#handlers: Map<string, Map<string, Set<MessageHandler>>> = new Map();

	get connection() {
		return this.#connection;
	}

	get channel() {
		return this.#pubChannel;
	}

	constructor(o: {
		rabbitMqConnectionFactory?: () => Promise<ChannelModel>,
		logger?: ILogger | IExtendableLogger
	}) {
		if (!o.rabbitMqConnectionFactory)
			throw new TypeError('rabbitMqConnectionFactory argument required');

		this.#connectionFactory = o.rabbitMqConnectionFactory;
		this.#appId = getRandomAppId();
		this.#logger = o.logger && 'child' in o.logger ?
			o.logger.child({ service: new.target.name }) :
			o.logger;
	}

	async connect(): Promise<ChannelModel> {
		while (this.#connecting)
			await delay(1_000);

		this.#connecting = true;

		while (!this.#connection) {
			try {
				this.#connection = await this.#connectionFactory();
				this.#connection.on('error', err => this.#onConnectionError(err));
				this.#connection.on('close', () => this.#onConnectionClosed());
				this.#logger?.info(`${this.#appId}: Connection established`);

				this.#handlers.clear();
				const subscriptionsToRestore = this.#subscriptions.splice(0);
				for (const subscription of subscriptionsToRestore)
					await this.subscribe(subscription);
			}
			catch (err: any) {
				this.#logger?.warn(`${this.#appId}: Connection attempt failed: ${err.message}`);
				await delay(5_000);
			}
		}

		this.#connecting = false;

		return this.#connection;
	}

	async disconnect() {
		await this.#connection?.close();
		if (this.#connection) // clean up in case 'close' event was not triggered
			this.#onConnectionClosed();
	}

	#onConnectionError(err: Error) {
		this.#logger?.warn(`${this.#appId}: Connection error: ${err.message}`);
	}

	#onConnectionClosed() {
		this.#logger?.warn('Connection closed');
		this.#connection = undefined;
		this.#pubChannel = undefined;
		this.#exclusiveQueueName = undefined;
		this.#queueChannels.clear();
		this.#queueConsumers.clear();
	}

	#getHandlers(queueGivenName: string = '', eventType: string = '*') {
		return this.#subscriptions.filter(s =>
			s.queueGivenName === queueGivenName
			&& (
				!s.eventType
				|| s.eventType === '*'
				|| s.eventType === eventType
			)
		);
	}

	async subscribeToQueue(exchange: string, queueName: string, handler: MessageHandler) {
		return this.subscribe({ exchange, queueName, handler });
	}

	/**
	 * Subscribes to a non-durable, exclusive queue without requiring acknowledgments.
	 * The queue is deleted when the connection closes.
	 * Messages are considered "delivered" upon receipt.
	 * Failed message processing does not result in redelivery or dead-lettering.
	 */
	async subscribeToFanout(exchange: string, handler: MessageHandler) {
		return this.subscribe({ exchange, handler, ignoreOwn: true });
	}

	async subscribe(subscription: Subscription) {
		const {
			exchange,
			queueName,
			eventType,
			concurrentLimit
		} = subscription;

		const channel = await this.#assertChannel(queueName);

		let queueGivenName = queueName;
		if (!queueGivenName) {
			// Handle temporary (exclusive) queue case
			if (!this.#exclusiveQueueName) {
				// Assert temporary "exclusive" queue that will be destroyed on connection termination
				this.#exclusiveQueueName = await this.#assetQueue(channel, exchange, '', eventType, {
					exclusive: true,
					durable: false
				});
			}
			else {
				// If exclusive queue already exists, ensure it is bound with the current event type
				await this.#assertBinding(channel, exchange, this.#exclusiveQueueName, eventType);
			}
			queueGivenName = this.#exclusiveQueueName;
		}
		else {
			// Handle durable queue case
			const deadLetterExchangeName = `${exchange}.failed`;

			// Assert dead letter queue for rejected or timed out messages
			await this.#assetQueue(channel, deadLetterExchangeName, `${queueGivenName}.failed`);

			// Assert durable queue that will survive broker restart
			await this.#assetQueue(channel, exchange, queueGivenName, eventType, { deadLetterExchangeName });
		}

		await this.#assertConsumer(queueGivenName, channel, concurrentLimit);

		this.#subscriptions.push({ ...subscription, queueGivenName });
	}

	async unsubscribe(d: Subscription) {
		this.#subscriptions = this.#subscriptions.filter(s => !(
			s.exchange === d.exchange &&
			s.queueName === d.queueName &&
			s.eventType === d.eventType &&
			s.handler === d.handler));
	}

	async #assertConnection() {
		return this.#connection ?? await this.connect();
	}

	/** Get existing or open a new channel for a given queue name */
	async #assertChannel(queueName: string = ''): Promise<Channel> {
		const connection = await this.#assertConnection();
		let channel = this.#queueChannels.get(queueName);
		if (!channel) {
			channel = await connection.createChannel();
			this.#queueChannels.set(queueName, channel);
		}
		return channel;
	}

	/**
	 * Ensure queue, exchange, and binding exist
	 */
	async #assetQueue(channel: Channel, exchange: string, queueName: string, eventType?: string, options?: {
		/** The queue will survive a broker restart */
		durable?: boolean,

		/** Used by only one connection and the queue will be deleted when that connection closes */
		exclusive?: boolean,

		/** Exchange where rejected or timed out messages will be delivered */
		deadLetterExchangeName?: string,
	}) {
		const {
			durable = true,
			exclusive = false,
			deadLetterExchangeName
		} = options ?? {};

		await channel.assertExchange(exchange, 'topic', { durable: true });
		const { queue: queueGivenName } = await channel.assertQueue(queueName, {
			exclusive,
			durable,
			...deadLetterExchangeName && {
				arguments: {
					'x-dead-letter-exchange': deadLetterExchangeName
				}
			}
		});

		await this.#assertBinding(channel, exchange, queueGivenName, eventType);

		return queueGivenName;
	}

	async #assertBinding(channel: Channel, exchange: string, queueGivenName: string, eventType?: string) {
		if (!eventType || eventType === '*')
			eventType = '#';

		await channel.bindQueue(queueGivenName, exchange, eventType);

		this.#logger?.debug(`${this.#appId}: Queue "${queueGivenName}" bound to exchange "${exchange}" with pattern "${eventType}"`);
	}

	async #assertConsumer(queueGivenName: string, channel: Channel, concurrentLimit?: number) {
		if (this.#queueConsumers.has(queueGivenName))
			return;

		if (concurrentLimit)
			await channel.prefetch(concurrentLimit);

		const c = await channel.consume(queueGivenName, async (msg: ConsumeMessage | null) => {
			if (!msg)
				return;

			const { consumerTag, routingKey } = msg.fields;
			const { appId, messageId, correlationId } = msg.properties;

			this.#logger?.debug(`${this.#appId}: Message received`, {
				queueName: queueGivenName,
				consumerTag,
				routingKey,
				messageId,
				correlationId,
				appId
			});

			try {
				const jsonContent = msg.content.toString();
				const message: IMessage = JSON.parse(jsonContent);

				const handlers = this.#getHandlers(queueGivenName, message.type);
				if (!handlers.length && !isSystemQueue(queueGivenName))
					throw new Error(`Message from queue "${queueGivenName}" was delivered to a consumer that does not handle type "${message.type}"`);

				for (const { handler, ignoreOwn } of handlers) {
					if (ignoreOwn && appId === this.#appId)
						continue;

					await handler(message);
				}

				channel?.ack(msg);
			}
			catch (err: any) {
				this.#logger?.error(`${this.#appId}: Message processing failed: ${err.message}`);

				// Redirect message to dead letter queue, if `{ noAck: true }` was not set on consumption
				channel?.nack(msg, false, false);
			}
		});

		this.#logger?.debug(`${this.#appId}: Consumer "${c.consumerTag}" registered on queue "${queueGivenName}"`);

		this.#queueConsumers.set(queueGivenName, c.consumerTag);
	}

	/**
	 * Publishes an event to the fanout exchange.
	 * The event will be delivered to all subscribers, except this instance's own consumer.
	 */
	async publish(exchange: string, message: IMessage): Promise<void> {
		if (typeof exchange !== 'string' || !exchange.length)
			throw new TypeError('exchange argument must be a non-empty String');
		if (!isMessage(message))
			throw new TypeError('valid message argument is required');

		if (!this.#pubChannel) {
			const connection = await this.#assertConnection();
			this.#pubChannel = await connection.createConfirmChannel();

			await this.#pubChannel.assertExchange(exchange, 'topic', { durable: true });
		}

		const content = Buffer.from(JSON.stringify(message), 'utf8');
		const properties = {
			contentType: 'application/json',
			contentEncoding: 'utf8',
			persistent: true,
			timestamp: message.context?.ts ?? Date.now(),
			appId: this.#appId,
			type: message.type,
			messageId: 'id' in message && typeof message.id === 'string' ?
				message.id :
				undefined,
			correlationId: message.sagaId?.toString()
		};

		return new Promise<void>((resolve, reject) => {
			const published = this.#pubChannel!.publish(exchange, message.type, content, properties, err =>
				err ? reject(err) : resolve());
			if (!published)
				throw new Error(`${this.#appId}: Failed to send event ${Event.describe(message)}, channel buffer is full`);
		});
	}
}
