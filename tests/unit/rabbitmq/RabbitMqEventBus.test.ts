import type { IMessageHandler } from '../../../src/interfaces/index.ts';
import { RabbitMqEventBus } from '../../../src/rabbitmq/RabbitMqEventBus.ts';

function createGateway() {
	return {
		publish: jest.fn(),
		subscribe: jest.fn(),
		unsubscribe: jest.fn()
	};
}

describe('RabbitMqEventBus', () => {

	const handler: IMessageHandler = jest.fn();

	describe('on()', () => {

		it('forwards config to gateway.subscribe() and always enables singleActiveConsumer', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqEventBus({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBusConfig: {
					exchange: 'events',
					queueName: 'event-queue',
					concurrentLimit: 2,
					handlerProcessTimeout: 1234,
					queueExpires: 5678
				}
			});

			await bus.on('test.event', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith({
				exchange: 'events',
				queueName: 'event-queue',
				eventType: 'test.event',
				handler,
				ignoreOwn: true,
				concurrentLimit: 2,
				deadLetterQueue: false,
				handlerProcessTimeout: 1234,
				queueExpires: 5678,
				messageTtl: undefined,
				singleActiveConsumer: true
			});
		});

		it('enables singleActiveConsumer even without queueName', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqEventBus({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBusConfig: { exchange: 'events' }
			});

			await bus.on('test.event', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith({
				exchange: 'events',
				queueName: undefined,
				eventType: 'test.event',
				handler,
				ignoreOwn: true,
				concurrentLimit: undefined,
				deadLetterQueue: false,
				handlerProcessTimeout: undefined,
				queueExpires: undefined,
				messageTtl: undefined,
				singleActiveConsumer: true
			});
		});
	});

	describe('messageTtl', () => {

		it('forwards messageTtl to gateway.subscribe() when set in config', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqEventBus({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBusConfig: {
					exchange: 'events',
					messageTtl: 0
				}
			});

			await bus.on('test.event', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith(
				expect.objectContaining({ messageTtl: 0 })
			);
		});
	});

	describe('queue()', () => {

		it('forwards config to gateway.subscribe()', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqEventBus({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBusConfig: {
					exchange: 'events',
					concurrentLimit: 4,
					handlerProcessTimeout: 3456,
					queueExpires: 7890
				}
			});

			await bus.queue('shared-queue').on('test.event', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith({
				exchange: 'events',
				queueName: 'shared-queue',
				eventType: 'test.event',
				handler,
				ignoreOwn: false,
				concurrentLimit: 4,
				deadLetterQueue: false,
				handlerProcessTimeout: 3456,
				queueExpires: 7890,
				messageTtl: undefined
			});
		});
	});
});
