import { IContainer } from '../interfaces/IContainer';
import { IMessage } from '../interfaces/IMessage';
import { RabbitMqGateway } from './RabbitMqGateway';
import { IEventDispatcher } from '../interfaces';
import * as Event from '../Event';
import { DEFAULT_EXCHANGE } from './constants';

export class RabbitMqEventInjector {
	#rabbitMqGateway: RabbitMqGateway;
	#eventDispatcher: IEventDispatcher;
	#logger: IContainer['logger'];

	#exchangeName: string;
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

		this.#exchangeName = container.exchange ?? DEFAULT_EXCHANGE;
		this.#messageHandler = this.#handleMessage.bind(this);

		this.start();
	}

	async start(): Promise<void> {
		this.#logger?.debug(`Subscribing to messages from exchange "${this.#exchangeName}"...`);

		await this.#rabbitMqGateway.subscribeToFanout(this.#exchangeName, this.#messageHandler);

		this.#logger?.debug(`Listening to messages from exchange "${this.#exchangeName}"`);
	}

	async #handleMessage(message: IMessage): Promise<void> {
		this.#logger?.debug(`Received "${Event.describe(message)}" message from exchange "${this.#exchangeName}"`);
		try {
			await this.#eventDispatcher.dispatch([message]);

			this.#logger?.debug(`${Event.describe(message)} dispatched successfully`);
		}
		catch (error: any) {
			this.#logger?.error(`Failed to dispatch event ${message.type}: ${error.message}`, { stack: error.stack });

			throw error; // Re-throw to ensure message is nack'd by the gateway
		}
	}
}
