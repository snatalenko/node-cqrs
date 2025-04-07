import { IEvent, IEventBus, IMessageHandler, IObservable } from '../interfaces';
import { DEFAULT_EXCHANGE } from './constants';
import { RabbitMqGateway } from './RabbitMqGateway';

const ALL_EVENTS_WILDCARD = '*';

export class RabbitMqEventBus implements IEventBus {

	static get allEventsWildcard(): '*' {
		return ALL_EVENTS_WILDCARD;
	}

	#gateway: RabbitMqGateway;
	#queues = new Map<string, RabbitMqEventBus>();
	#exchange: string;
	#queueName: string | undefined;

	constructor(o: {
		rabbitMqGateway: RabbitMqGateway,
		exchange?: string,
		queueName?: string
	}) {
		this.#gateway = o.rabbitMqGateway;
		this.#exchange = o.exchange ?? DEFAULT_EXCHANGE;
		this.#queueName = o.queueName;
	}


	/**
	 * Publishes an event to the fanout exchange.
	 * The event will be delivered to all subscribers, except this instance's own consumer.
	 */
	async publish(event: IEvent): Promise<void> {
		await this.#gateway.publish(this.#exchange, event);
	}

	/**
	 * Registers a message handler for a specific event type.
	 *
	 * @param eventType The event type to listen for.
	 * @param handler The function to handle incoming messages of the specified type.
	 */
	async on(eventType: string, handler: IMessageHandler): Promise<void> {
		await this.#gateway.subscribe({
			exchange: this.#exchange,
			queueName: this.#queueName,
			eventType,
			handler,
			ignoreOwn: !this.#queueName
		});
	}

	/**
	 * Removes a previously registered message handler for a specific event type.
	 */
	off(eventType: string, handler: IMessageHandler): void {
		this.#gateway.unsubscribe({
			exchange: this.#exchange,
			queueName: this.#queueName,
			eventType,
			handler
		});
	}

	/**
	 * Returns a new instance of RabbitMqGateway that uses a durable queue with the given name.
	 * This ensures that all messages published to the fanout exchange are also delivered to this queue.
	 *
	 * @param name The name of the durable queue.
	 * @returns A new RabbitMqGateway instance configured to use the specified queue.
	 */
	queue(name: string): IObservable {
		let queue = this.#queues.get(name);
		if (!queue) {
			queue = new RabbitMqEventBus({
				rabbitMqGateway: this.#gateway,
				exchange: this.#exchange,
				queueName: name
			});
			this.#queues.set(name, queue);
		}
		return queue;
	}
}
