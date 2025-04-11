import { IContainer } from '../interfaces/IContainer';
import { IMessage } from '../interfaces/IMessage';
import { RabbitMqGateway } from './RabbitMqGateway';
import { IEventDispatcher } from '../interfaces';
import * as Event from '../Event';
import { DEFAULT_EXCHANGE } from './constants';

/**
 * Injects events received from a RabbitMQ exchange into the local event dispatcher.
 *
 * It subscribes to a specified fanout exchange on RabbitMQ and dispatches
 * any received messages as events using the provided event dispatcher.
 */
export class RabbitMqEventInjector {
	#rabbitMqGateway: RabbitMqGateway;
	#messageHandler: (message: IMessage) => Promise<void>;
	#eventDispatcher: IEventDispatcher;
	#logger: IContainer['logger'];

	constructor(container: Partial<Pick<IContainer, 'eventDispatcher' | 'rabbitMqGateway' | 'logger'>>) {
		if (!container.eventDispatcher)
			throw new Error('eventDispatcher is required in the container.');
		if (!container.rabbitMqGateway)
			throw new Error('rabbitMqGateway is required in the container.');

		this.#rabbitMqGateway = container.rabbitMqGateway;
		this.#messageHandler = (msg: IMessage) => this.#handleMessage(msg);
		this.#eventDispatcher = container.eventDispatcher;
		this.#logger = container.logger && 'child' in container.logger ?
			container.logger.child({ service: new.target.name }) :
			container.logger;
	}

	async start(exchange: string = DEFAULT_EXCHANGE): Promise<void> {
		this.#logger?.debug(`Subscribing to messages from exchange "${exchange}"...`);

		await this.#rabbitMqGateway.subscribeToFanout(exchange, this.#messageHandler);

		this.#logger?.debug(`Listening to messages from exchange "${exchange}"`);
	}

	async stop(exchange: string = DEFAULT_EXCHANGE): Promise<void> {
		this.#logger?.debug(`Unsubscribing from messages from exchange "${exchange}"...`);

		await this.#rabbitMqGateway.unsubscribe({
			exchange,
			handler: this.#messageHandler
		});

		this.#logger?.debug(`Stopped listening to messages from exchange "${exchange}"`);
	}

	async #handleMessage(message: IMessage): Promise<void> {
		this.#logger?.debug(`"${Event.describe(message)}" received`);
		try {
			await this.#eventDispatcher.dispatch([message], { origin: 'external' });

			this.#logger?.debug(`${Event.describe(message)} dispatched successfully`);
		}
		catch (error: any) {
			this.#logger?.error(`Failed to dispatch event ${message.type}: ${error.message}`, { stack: error.stack });

			throw error; // Re-throw to ensure message is nack'd by the gateway
		}
	}
}
