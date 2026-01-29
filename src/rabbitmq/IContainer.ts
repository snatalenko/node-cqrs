import { RabbitMqGateway } from './RabbitMqGateway.ts';

declare module '../interfaces/IContainer' {
	interface IContainer {
		rabbitMqGateway?: RabbitMqGateway;
	}
}
