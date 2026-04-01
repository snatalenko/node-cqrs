import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway.ts';
import { EventEmitter } from 'stream';

function createMockChannel() {
	const assertQueueCalls: Array<{ name: string, options: any }> = [];
	return {
		assertQueueCalls,
		assertExchange: jest.fn().mockResolvedValue(undefined),
		assertQueue: jest.fn().mockImplementation((name, options) => {
			assertQueueCalls.push({ name, options });
			return Promise.resolve({ queue: name || 'auto-generated-queue', messageCount: 0, consumerCount: 0 });
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

	describe('x-consumer-timeout', () => {

		it('sets x-consumer-timeout to handlerProcessTimeout + 1000 on durable queue', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				handlerProcessTimeout: 30_000
			});

			// assertQueue is called twice for durable queues: first for the dead letter queue, then for the main queue.
			// The main queue call has x-dead-letter-exchange.
			const durableQueueCall = channel.assertQueueCalls.find(
				c => c.options.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall!.options.arguments['x-consumer-timeout']).toBe(31_000);
		});

		it('sets x-consumer-timeout to default HANDLER_PROCESS_TIMEOUT + 1000 when not specified', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn()
			});

			const durableQueueCall = channel.assertQueueCalls.find(
				c => c.options.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall!.options.arguments['x-consumer-timeout']).toBe(
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
				c => c.options.arguments?.['x-dead-letter-exchange']
			);

			expect(durableQueueCall).toBeDefined();
			expect(durableQueueCall!.options.arguments['x-consumer-timeout']).toBeUndefined();
		});

		it('sets default x-consumer-timeout on exclusive (fanout) queues', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				handler: jest.fn()
			});

			const exclusiveQueueCall = channel.assertQueueCalls.find(
				c => c.options.exclusive === true
			);

			expect(exclusiveQueueCall).toBeDefined();
			expect(exclusiveQueueCall!.options.arguments['x-consumer-timeout']).toBe(
				RabbitMqGateway.HANDLER_PROCESS_TIMEOUT + 1_000
			);
		});
	});

	describe('deadLetterQueue', () => {

		it('creates dead letter queue by default for durable queues', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn()
			});

			const dlqCall = channel.assertQueueCalls.find(c => c.name === 'test-queue.failed');
			expect(dlqCall).toBeDefined();

			const mainQueueCall = channel.assertQueueCalls.find(c => c.name === 'test-queue');
			expect(mainQueueCall!.options.arguments['x-dead-letter-exchange']).toBe('test-exchange.failed');
		});

		it('skips dead letter queue when deadLetterQueue is false', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				deadLetterQueue: false
			});

			const dlqCall = channel.assertQueueCalls.find(c => c.name === 'test-queue.failed');
			expect(dlqCall).toBeUndefined();

			const mainQueueCall = channel.assertQueueCalls.find(c => c.name === 'test-queue');
			expect(mainQueueCall).toBeDefined();
			expect(mainQueueCall!.options.arguments['x-dead-letter-exchange']).toBeUndefined();
		});

		it('creates dead letter queue when deadLetterQueue is explicitly true', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				deadLetterQueue: true
			});

			const dlqCall = channel.assertQueueCalls.find(c => c.name === 'test-queue.failed');
			expect(dlqCall).toBeDefined();

			const mainQueueCall = channel.assertQueueCalls.find(c => c.name === 'test-queue');
			expect(mainQueueCall!.options.arguments['x-dead-letter-exchange']).toBe('test-exchange.failed');
		});

		it('does not create dead letter queue by default for exclusive queues', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				handler: jest.fn()
			});

			const dlqCall = channel.assertQueueCalls.find(c => c.name?.endsWith('.failed'));
			expect(dlqCall).toBeUndefined();

			expect(channel.assertQueueCalls).toHaveLength(1);
			expect(channel.assertQueueCalls[0].options.exclusive).toBe(true);
		});

		it('throws when deadLetterQueue is true on exclusive queue', async () => {
			await expect(gateway.subscribe({
				exchange: 'test-exchange',
				handler: jest.fn(),
				deadLetterQueue: true
			})).rejects.toThrow('deadLetterQueue requires a durable queue (queueName must be set)');
		});
	});
});
