import type { IMessageHandler } from '../../../src/interfaces/index.ts';
import { RabbitMqCommandBus } from '../../../src/rabbitmq/RabbitMqCommandBus.ts';

function createGateway() {
	return {
		publish: jest.fn(),
		subscribe: jest.fn(),
		unsubscribe: jest.fn()
	};
}

describe('RabbitMqCommandBus', () => {

	const handler: IMessageHandler = jest.fn();

	describe('on()', () => {

		it('forwards config to gateway.subscribe()', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqCommandBus({
				rabbitMqGateway: gateway as any,
				rabbitMqCommandBusConfig: {
					exchange: 'commands',
					queueName: 'command-queue',
					concurrentLimit: 3,
					handlerProcessTimeout: 2345,
					queueExpires: 6789
				}
			});

			await bus.on('test.command', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith({
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

		it('uses the default queue name when queueName is not configured', async () => {
			const gateway = createGateway();
			const bus = new RabbitMqCommandBus({
				rabbitMqGateway: gateway as any,
				rabbitMqCommandBusConfig: {
					exchange: 'commands'
				}
			});

			await bus.on('test.command', handler);

			expect(gateway.subscribe).toHaveBeenCalledWith({
				exchange: 'commands',
				queueName: RabbitMqCommandBus.DEFAULT_QUEUE_NAME,
				eventType: 'test.command',
				handler,
				ignoreOwn: false,
				concurrentLimit: undefined,
				handlerProcessTimeout: undefined,
				queueExpires: undefined
			});
		});

		it('allows overriding the default queue name via static field', async () => {
			const gateway = createGateway();
			const oldDefaultQueueName = RabbitMqCommandBus.DEFAULT_QUEUE_NAME;
			RabbitMqCommandBus.DEFAULT_QUEUE_NAME = 'custom-default-queue';

			try {
				const bus = new RabbitMqCommandBus({
					rabbitMqGateway: gateway as any,
					rabbitMqCommandBusConfig: {
						exchange: 'commands'
					}
				});

				await bus.on('test.command', handler);

				expect(gateway.subscribe).toHaveBeenCalledWith({
					exchange: 'commands',
					queueName: 'custom-default-queue',
					eventType: 'test.command',
					handler,
					ignoreOwn: false,
					concurrentLimit: undefined,
					handlerProcessTimeout: undefined,
					queueExpires: undefined
				});
			}
			finally {
				RabbitMqCommandBus.DEFAULT_QUEUE_NAME = oldDefaultQueueName;
			}
		});

		it('can be created without any config', async () => {
			const gateway = createGateway();
			const oldDefaultExchange = RabbitMqCommandBus.DEFAULT_EXCHANGE;
			const oldDefaultQueueName = RabbitMqCommandBus.DEFAULT_QUEUE_NAME;
			RabbitMqCommandBus.DEFAULT_EXCHANGE = 'custom-default-exchange';
			RabbitMqCommandBus.DEFAULT_QUEUE_NAME = 'custom-default-queue';

			try {
				const bus = new RabbitMqCommandBus({
					rabbitMqGateway: gateway as any
				});

				await bus.on('test.command', handler);

				expect(gateway.subscribe).toHaveBeenCalledWith({
					exchange: 'custom-default-exchange',
					queueName: 'custom-default-queue',
					eventType: 'test.command',
					handler,
					ignoreOwn: false,
					concurrentLimit: undefined,
					handlerProcessTimeout: undefined,
					queueExpires: undefined
				});
			}
			finally {
				RabbitMqCommandBus.DEFAULT_EXCHANGE = oldDefaultExchange;
				RabbitMqCommandBus.DEFAULT_QUEUE_NAME = oldDefaultQueueName;
			}
		});
	});

	describe('send() telemetry', () => {

		function createBus(gateway: ReturnType<typeof createGateway>) {
			return new RabbitMqCommandBus({
				rabbitMqGateway: gateway as any,
				rabbitMqCommandBusConfig: { exchange: 'commands', queueName: 'q', ignoreOwn: false }
			});
		}

		it('forwards meta to gateway.publish when provided', async () => {
			const gateway = createGateway();
			const bus = createBus(gateway);
			const meta = { span: { end: jest.fn() } as any };

			await bus.send({ type: 'doSomething' }, meta);

			expect(gateway.publish).toHaveBeenCalledWith('commands', expect.any(Object), meta);
		});

		it('works without meta (no-op)', async () => {
			const gateway = createGateway();
			const bus = createBus(gateway);

			await bus.send({ type: 'doSomething' });

			expect(gateway.publish).toHaveBeenCalledWith('commands', expect.any(Object), undefined);
		});

		it('extracts span from options in string-form send and passes it as meta', async () => {
			const gateway = createGateway();
			const bus = createBus(gateway);
			const span = { end: jest.fn() } as any;

			await bus.send('doSomething', '1', { span });

			const [, publishedCommand, publishedMeta] = gateway.publish.mock.calls[0];
			expect(publishedMeta).toEqual({ span });
			expect(publishedCommand).not.toHaveProperty('span');
		});
	});
});
