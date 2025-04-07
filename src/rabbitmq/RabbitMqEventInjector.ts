import { IContainer } from '../interfaces/IContainer';
import { IMessage } from '../interfaces/IMessage';
import { RabbitMqGateway } from './RabbitMqGateway';
import { IEventDispatcher } from '../interfaces';
import * as Event from '../Event';

export class RabbitMqEventInjector {
	#rabbitMqGateway: RabbitMqGateway;
	#eventDispatcher: IEventDispatcher;
	#logger: IContainer['logger'];

	#exchangeName: string;
	#queueName: string;
	#messageHandler: (message: IMessage) => Promise<void>;

	constructor(container: Partial<Pick<IContainer, 'eventDispatcher' | 'rabbitMqGateway' | 'logger'>> & {
		exchange?: string;
		queueName?: string;
	}) {
		if (!container.eventDispatcher)
			throw new Error('eventDispatcher is required in the container.');
		if (!container.rabbitMqGateway)
			throw new Error('rabbitMqGateway is required in the container.');

		this.#rabbitMqGateway = container.rabbitMqGateway;
		this.#eventDispatcher = container.eventDispatcher;

		this.#logger = container.logger && 'child' in container.logger ?
			container.logger.child({ service: new.target.name }) :
			container.logger;

		this.#exchangeName = container.exchange ?? 'node-cqrs.events';
		this.#queueName = container.queueName ?? 'node-cqrs.persistence';
		this.#messageHandler = this.#handleMessage.bind(this);

		this.start();
	}

	async start(): Promise<void> {
		this.#logger?.info(`Starting event injection from queue "${this.#queueName}"`);

		await this.#rabbitMqGateway.subscribeToQueue(
			this.#exchangeName,
			this.#queueName,
			this.#messageHandler
		);

		this.#logger?.info(`Subscribed to queue "${this.#queueName}" on exchange "${this.#exchangeName}"`);
	}

	async #handleMessage(message: IMessage): Promise<void> {
		this.#logger?.debug(`Received message from queue "${this.#queueName}": ${message.type}`);
		try {
			// EventDispatcher expects an array of events (IEventSet)
			// Assuming IMessage is compatible with IEvent or needs transformation
			await this.#eventDispatcher.dispatch([message]);
			this.#logger?.debug(`Event ${Event.describe(message)} dispatched successfully`);
		}
		catch (error: any) {
			this.#logger?.error(`Failed to dispatch event ${message.type}: ${error.message}`, { stack: error.stack });

			throw error; // Re-throw to ensure message is nack'd by the gateway
		}
	}
}
