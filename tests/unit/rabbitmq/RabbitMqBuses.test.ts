import type { IMessageHandler } from '../../../src/interfaces/index.ts';
import { RabbitMqCommandBus } from '../../../src/rabbitmq/RabbitMqCommandBus.ts';
import { RabbitMqEventBus } from '../../../src/rabbitmq/RabbitMqEventBus.ts';

describe('RabbitMq bus config forwarding', () => {
	const handler: IMessageHandler = jest.fn();

	function createGateway() {
		return {
			publish: jest.fn(),
			subscribe: jest.fn(),
			unsubscribe: jest.fn()
		};
	}

	it('forwards handlerProcessTimeout and queueExpires from event bus config to subscribe()', async () => {
		const rabbitMqGateway = createGateway();
		const bus = new RabbitMqEventBus({
			rabbitMqGateway: rabbitMqGateway as any,
			rabbitMqEventBusConfig: {
				exchange: 'events',
				queueName: 'event-queue',
				concurrentLimit: 2,
				handlerProcessTimeout: 1234,
				queueExpires: 5678
			}
		});

		await bus.on('test.event', handler);

		expect(rabbitMqGateway.subscribe).toHaveBeenCalledWith({
			exchange: 'events',
			queueName: 'event-queue',
			eventType: 'test.event',
			handler,
			ignoreOwn: true,
			concurrentLimit: 2,
			handlerProcessTimeout: 1234,
			queueExpires: 5678,
			singleActiveConsumer: true
		});
	});

	it('always enables single active consumer for event bus subscriptions even without queueName', async () => {
		const rabbitMqGateway = createGateway();
		const bus = new RabbitMqEventBus({
			rabbitMqGateway: rabbitMqGateway as any,
			rabbitMqEventBusConfig: {
				exchange: 'events'
			}
		});

		await bus.on('test.event', handler);

		expect(rabbitMqGateway.subscribe).toHaveBeenCalledWith({
			exchange: 'events',
			queueName: undefined,
			eventType: 'test.event',
			handler,
			ignoreOwn: true,
			concurrentLimit: undefined,
			handlerProcessTimeout: undefined,
			queueExpires: undefined,
			singleActiveConsumer: true
		});
	});

	it('forwards handlerProcessTimeout and queueExpires from command bus config to subscribe()', async () => {
		const rabbitMqGateway = createGateway();
		const bus = new RabbitMqCommandBus({
			rabbitMqGateway: rabbitMqGateway as any,
			rabbitMqCommandBusConfig: {
				exchange: 'commands',
				queueName: 'command-queue',
				concurrentLimit: 3,
				handlerProcessTimeout: 2345,
				queueExpires: 6789
			}
		});

		await bus.on('test.command', handler);

		expect(rabbitMqGateway.subscribe).toHaveBeenCalledWith({
			exchange: 'commands',
			queueName: 'command-queue',
			eventType: 'test.command',
			handler,
			ignoreOwn: false,
			concurrentLimit: 3,
			handlerProcessTimeout: 2345,
			queueExpires: 6789
		});
	});

	it('passes handlerProcessTimeout and queueExpires from event bus config to queue(name)', async () => {
		const rabbitMqGateway = createGateway();
		const bus = new RabbitMqEventBus({
			rabbitMqGateway: rabbitMqGateway as any,
			rabbitMqEventBusConfig: {
				exchange: 'events',
				concurrentLimit: 4,
				handlerProcessTimeout: 3456,
				queueExpires: 7890
			}
		});

		await bus.queue('shared-queue').on('test.event', handler);

		expect(rabbitMqGateway.subscribe).toHaveBeenCalledWith({
			exchange: 'events',
			queueName: 'shared-queue',
			eventType: 'test.event',
			handler,
			ignoreOwn: false,
			concurrentLimit: 4,
			handlerProcessTimeout: 3456,
			queueExpires: 7890
		});
	});
});
