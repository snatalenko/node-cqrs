import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway.ts';
import { EventEmitter } from 'stream';

/**
 * Minimal mock of an amqplib ConfirmChannel for publish tests.
 */
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
		publish: jest.fn((_exch: string, _key: string, _c: Buffer, _props: any, cb?: (err: any) => void) => {
			cb?.(null);
			return true;
		}),
		consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-1' }),
		ack: jest.fn(),
		nack: jest.fn(),
		prefetch: jest.fn().mockResolvedValue(undefined),
		cancel: jest.fn(async () => ({})),
		on: jest.fn()
	};
}

function createMockConnection(channel: ReturnType<typeof createMockChannel>) {
	return {
		createChannel: jest.fn(async () => channel),
		createConfirmChannel: jest.fn(async () => channel),
		on: jest.fn(),
		close: jest.fn(async () => { })
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

	describe('tracing', () => {

		describe('publish()', () => {

			it('creates a span and injects trace context into AMQP headers', async () => {
				const spans: any[] = [];
				const tracer = {
					startSpan: jest.fn((name: string, opts: any, ctx: any) => {
						const span = {
							name,
							opts,
							ctx,
							end: jest.fn(),
							recordException: jest.fn(),
							setStatus: jest.fn(),
							spanContext: () => ({ traceId: 'abc123', spanId: 'def456', traceFlags: 1 })
						};
						spans.push(span);
						return span;
					})
				};
				const tracerFactory = () => tracer as any;

				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any,
					tracerFactory
				});

				await gateway.publish('test-exchange', { type: 'testEvent', aggregateId: '42' });

				// Span was created with correct name and attributes
				expect(spans).toHaveLength(1);
				expect(spans[0].name).toBe('RabbitMqGateway.publish testEvent');
				expect(spans[0].end).toHaveBeenCalled();

				// AMQP headers were passed to channel.publish
				const publishCall = channel.publish.mock.calls[0];
				const properties = publishCall[3];
				expect(properties).toHaveProperty('headers');
				expect(typeof properties.headers).toBe('object');
			});

			it('records error on span when publish fails', async () => {
				const spans: any[] = [];
				const tracer = {
					startSpan: jest.fn(() => {
						const span = {
							end: jest.fn(),
							recordException: jest.fn(),
							setStatus: jest.fn(),
							spanContext: () => ({ traceId: 'abc', spanId: 'def', traceFlags: 1 })
						};
						spans.push(span);
						return span;
					})
				};
				const tracerFactory = () => tracer as any;

				channel.publish.mockImplementation(() => {
					throw new Error('channel buffer full');
				});
				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any,
					tracerFactory
				});

				await expect(
					gateway.publish('test-exchange', { type: 'failEvent' })
				).rejects.toThrow('channel buffer full');

				expect(spans[0].recordException).toHaveBeenCalled();
				expect(spans[0].setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }));
				expect(spans[0].end).toHaveBeenCalled();
			});

			it('works without tracerFactory and sets no trace headers', async () => {
				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any
				});

				await gateway.publish('test-exchange', { type: 'noTraceEvent' });

				const publishCall = channel.publish.mock.calls[0];
				const properties = publishCall[3];
				expect(properties.headers).toEqual({});
			});
		});

		describe('consume (via subscribe)', () => {

			it('passes no span in meta when tracerFactory is not provided', async () => {
				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any
				});

				let receivedMeta: any;
				await gateway.subscribeToQueue('test-exchange', 'test-queue', (_msg, meta) => {
					receivedMeta = meta;
				});

				const consumeCallback = channel.consume.mock.calls[0][1];
				await consumeCallback({
					content: Buffer.from(JSON.stringify({ type: 'untracedEvent' })),
					fields: { consumerTag: 'ctag-1', routingKey: 'untracedEvent' },
					properties: { headers: {}, appId: 'other', messageId: 'msg-1' }
				});

				expect(receivedMeta).toEqual({ span: undefined });
				expect(channel.ack).toHaveBeenCalled();
			});

			it('creates a span from extracted AMQP headers and passes it to handler', async () => {
				const spans: any[] = [];
				const tracer = {
					startSpan: jest.fn((name: string) => {
						const span = {
							name,
							end: jest.fn(),
							recordException: jest.fn(),
							setStatus: jest.fn(),
							spanContext: () => ({ traceId: 'abc', spanId: 'def', traceFlags: 1 })
						};
						spans.push(span);
						return span;
					})
				};
				const tracerFactory = () => tracer as any;

				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any,
					tracerFactory
				});

				let receivedMeta: any;
				await gateway.subscribeToQueue('test-exchange', 'test-queue', (_msg, meta) => {
					receivedMeta = meta;
				});

				// Simulate an incoming AMQP message by invoking the consume callback
				const consumeCallback = channel.consume.mock.calls[0][1];
				const fakeMsg = {
					content: Buffer.from(JSON.stringify({ type: 'incomingEvent', aggregateId: '7' })),
					fields: { consumerTag: 'ctag-1', routingKey: 'incomingEvent' },
					properties: {
						headers: { traceparent: '00-abc123-def456-01' },
						appId: 'other-app',
						messageId: 'msg-1'
					}
				};

				await consumeCallback(fakeMsg);

				// Span was created for consume
				const consumeSpan = spans.find(s => s.name === 'RabbitMqGateway.consume incomingEvent');
				expect(consumeSpan).toBeDefined();
				expect(consumeSpan.end).toHaveBeenCalled();

				// Handler received meta with span
				expect(receivedMeta).toHaveProperty('otelSpan');
				expect(receivedMeta.otelSpan).toBe(consumeSpan);

				// Message was acknowledged
				expect(channel.ack).toHaveBeenCalledWith(fakeMsg);
			});

			it('records error on consume span when handler throws', async () => {
				const spans: any[] = [];
				const tracer = {
					startSpan: jest.fn((name: string) => {
						const span = {
							name,
							end: jest.fn(),
							recordException: jest.fn(),
							setStatus: jest.fn(),
							spanContext: () => ({ traceId: 'abc', spanId: 'def', traceFlags: 1 })
						};
						spans.push(span);
						return span;
					})
				};
				const tracerFactory = () => tracer as any;

				gateway = new RabbitMqGateway({
					rabbitMqConnectionFactory: async () => connection as any,
					tracerFactory
				});

				await gateway.subscribeToQueue('test-exchange', 'test-queue', () => {
					throw new Error('handler boom');
				});

				const consumeCallback = channel.consume.mock.calls[0][1];
				const fakeMsg = {
					content: Buffer.from(JSON.stringify({ type: 'failingEvent' })),
					fields: { consumerTag: 'ctag-1', routingKey: 'failingEvent' },
					properties: { headers: {}, appId: 'other', messageId: 'msg-2' }
				};

				await consumeCallback(fakeMsg);

				const consumeSpan = spans.find(s => s.name === 'RabbitMqGateway.consume failingEvent');
				expect(consumeSpan).toBeDefined();
				expect(consumeSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
				expect(consumeSpan.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }));
				expect(consumeSpan.end).toHaveBeenCalled();

				// Message was rejected (nack)
				expect(channel.nack).toHaveBeenCalledWith(fakeMsg, false, false);
			});
		});
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

	describe('messageTtl', () => {

		it('sets x-message-ttl on durable queue when messageTtl is specified', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn(),
				messageTtl: 60_000
			});

			const mainQueueCall = channel.assertQueueCalls.find(
				c => c.options.arguments?.['x-dead-letter-exchange']
			);

			expect(mainQueueCall).toBeDefined();
			expect(mainQueueCall!.options.arguments['x-message-ttl']).toBe(60_000);
		});

		it('sets x-message-ttl on exclusive queue when messageTtl is specified', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				handler: jest.fn(),
				messageTtl: 30_000
			});

			const exclusiveQueueCall = channel.assertQueueCalls.find(
				c => c.options.exclusive === true
			);

			expect(exclusiveQueueCall).toBeDefined();
			expect(exclusiveQueueCall!.options.arguments['x-message-ttl']).toBe(30_000);
		});

		it('does not set x-message-ttl when messageTtl is not specified', async () => {
			await gateway.subscribe({
				exchange: 'test-exchange',
				queueName: 'test-queue',
				eventType: 'test.event',
				handler: jest.fn()
			});

			const mainQueueCall = channel.assertQueueCalls.find(
				c => c.options.arguments?.['x-dead-letter-exchange']
			);

			expect(mainQueueCall).toBeDefined();
			expect(mainQueueCall!.options.arguments['x-message-ttl']).toBeUndefined();
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
