import { RabbitMqEventInjector } from './RabbitMqEventInjector';
import { RabbitMqGateway } from './RabbitMqGateway';

declare module '../interfaces/IContainer' {
	interface IContainer {
		rabbitMqGateway?: RabbitMqGateway;
		rabbitMqEventInjector?: RabbitMqEventInjector;
		rabbitMqEventBus?: RabbitMqEventInjector;
	}
}
