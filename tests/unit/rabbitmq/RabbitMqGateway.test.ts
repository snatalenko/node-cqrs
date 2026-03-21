import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway.ts';

/**
 * Minimal mock of an amqplib ConfirmChannel for publish tests.
 */
function createMockChannel() {
	return {
		assertExchange: jest.fn(async () => ({})),
		assertQueue: jest.fn(async (_q: string, _opts: any) => ({ queue: _q || 'auto-queue' })),
		bindQueue: jest.fn(async () => ({})),
		publish: jest.fn((_exch: string, _key: string, _c: Buffer, _props: any, cb?: (err: any) => void) => {
			cb?.(null);
			return true;
		}),
		consume: jest.fn(async (_queue: string, _handler: any, _opts: any) => ({ consumerTag: 'ctag-1' })),
		ack: jest.fn(),
		nack: jest.fn(),
		prefetch: jest.fn(async () => ({})),
		cancel: jest.fn(async () => ({}))
	};
}

function createMockConnection(channel: ReturnType<typeof createMockChannel>) {
	return {
		createChannel: jest.fn(async () => channel),
		createConfirmChannel: jest.fn(async () => channel),
		on: jest.fn(),
		close: jest.fn(async () => {})
	};
}

describe('RabbitMqGateway tracing', () => {

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

			const channel = createMockChannel();
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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

			const channel = createMockChannel();
			channel.publish.mockImplementation(() => {
				throw new Error('channel buffer full');
			});
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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
			const channel = createMockChannel();
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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
			const channel = createMockChannel();
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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

			const channel = createMockChannel();
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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
			expect(receivedMeta).toHaveProperty('span');
			expect(receivedMeta.span).toBe(consumeSpan);

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

			const channel = createMockChannel();
			const connection = createMockConnection(channel);
			const gateway = new RabbitMqGateway({
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
