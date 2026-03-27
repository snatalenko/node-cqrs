import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway.ts';
import { EventEmitter } from 'stream';

function createMockChannel() {
	const assertQueueCalls: any[] = [];
	return {
		assertQueueCalls,
		assertExchange: jest.fn().mockResolvedValue(undefined),
		assertQueue: jest.fn().mockImplementation((_name, options) => {
			assertQueueCalls.push(options);
			return Promise.resolve({ queue: 'test-queue', messageCount: 0, consumerCount: 0 });
		}),
		bindQueue: jest.fn().mockResolvedValue(undefined),
		prefetch: jest.fn().mockResolvedValue(undefined),
		consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-1' }),
		on: jest.fn()
	};
}

function createMockConnection(channel: ReturnType<typeof createMockChannel>) {
	return {
		createChannel: jest.fn().mockResolvedValue(channel),
		createConfirmChannel: jest.fn().mockResolvedValue({
			on: jest.fn(),
			publish: jest.fn()
		}),
		on: jest.fn(),
		close: jest.fn().mockResolvedValue(undefined)
	};
}

describe('RabbitMqGateway', () => {

	describe('x-consumer-timeout', () => {

		let channel: ReturnType<typeof createMockChannel>;
		let connection: ReturnType<typeof createMockConnection>;
		let gateway: RabbitMqGateway;

		beforeEach(() => {
			channel = createMockChannel();
			connection = createMockConnection(channel);

			gateway = new RabbitMqGateway({
				rabbitMqConnectionFactory: () => Promise.resolve(connection as any),
				process: new EventEmitter() as any
			});
		});

		afterEach(async () => {
			await gateway.disconnect();
		});

		it('sets x-consumer-timeout to handlerProcessTimeout + 1000 on durable queue', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				handlerProcessTimeout: 30_000
			});

			// assertQueue is called twice for durable queues: first for the dead letter queue, then for the main queue.
			// The main queue call has x-queue-type: 'quorum' and x-dead-letter-exchange.
			const durableQueueCall = channel.assertQueueCalls.find(
				(opts: any) => opts.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall.arguments['x-consumer-timeout']).toBe(31_000);
		});

		it('sets x-consumer-timeout to default HANDLER_PROCESS_TIMEOUT + 1000 when not specified', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn()
			});

			const durableQueueCall = channel.assertQueueCalls.find(
				(opts: any) => opts.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall.arguments['x-consumer-timeout']).toBe(
				RabbitMqGateway.HANDLER_PROCESS_TIMEOUT + 1_000
			);
		});

		it('does not set x-consumer-timeout when handlerProcessTimeout is 0', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				handlerProcessTimeout: 0
			});

			const durableQueueCall = channel.assertQueueCalls.find(
				(opts: any) => opts.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall.arguments['x-consumer-timeout']).toBeUndefined();
		});

		it('sets default x-consumer-timeout on exclusive (fanout) queues', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				handler: jest.fn()
			});

			const exclusiveQueueCall = channel.assertQueueCalls.find(
				(opts: any) => opts.exclusive === true
			);

			expect(exclusiveQueueCall).toBeDefined();
			expect(exclusiveQueueCall.arguments['x-consumer-timeout']).toBe(
				RabbitMqGateway.HANDLER_PROCESS_TIMEOUT + 1_000
			);
		});
	});
});
