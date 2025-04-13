import { IEventBus } from '../interfaces';
import { RabbitMqEventInjector } from './RabbitMqEventInjector';
import { RabbitMqGateway } from './RabbitMqGateway';

declare module '../interfaces/IContainer' {
	interface IContainer {
		rabbitMqGateway?: RabbitMqGateway;
		rabbitMqEventInjector?: RabbitMqEventInjector;
		rabbitMqEventBus?: RabbitMqEventInjector;

		/**
		 * Optional external event bus for publishing events to an external system.
		 */
		externalEventBus?: IEventBus;
	}
}
