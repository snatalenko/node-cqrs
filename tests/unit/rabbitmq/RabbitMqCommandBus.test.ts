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
