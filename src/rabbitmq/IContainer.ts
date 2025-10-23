import { RabbitMqGateway } from './RabbitMqGateway';

declare module '../interfaces/IContainer' {
	interface IContainer {
		rabbitMqGateway?: RabbitMqGateway;
	}
}
