import type { ChannelModel } from 'amqplib';
import type { RabbitMqCommandBusConfig } from './RabbitMqCommandBus.ts';
import type { RabbitMqEventBusConfig } from './RabbitMqEventBus.ts';
import type { RabbitMqGateway } from './RabbitMqGateway.ts';
import type { ConfigProvider } from './utils/index.ts';

declare module 'node-cqrs' {
	interface IContainer {
		rabbitMqGateway: RabbitMqGateway;
		rabbitMqConnectionFactory: () => Promise<ChannelModel>;

		/**
		 * Provides app id for publish metadata and `ignoreOwn` filtering.
		 *
		 * Defaults to a random string for each {@link RabbitMqGateway} instance.
		 */
		rabbitMqAppId?: ConfigProvider<string>;

		rabbitMqEventBusConfig?: ConfigProvider<RabbitMqEventBusConfig>;

		rabbitMqCommandBusConfig?: ConfigProvider<RabbitMqCommandBusConfig>;
	}
}
