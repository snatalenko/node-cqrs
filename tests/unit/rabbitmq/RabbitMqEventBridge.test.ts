import { isDispatchPipelineProcessor, isEventFeed } from '../../../src/interfaces/index.ts';
import { RabbitMqEventBridge } from '../../../src/rabbitmq/RabbitMqEventBridge.ts';
import { RabbitMqEventBus } from '../../../src/rabbitmq/RabbitMqEventBus.ts';
import { Deferred } from '../../../src/utils/index.ts';

function createGateway() {
	return {
		publish: jest.fn().mockResolvedValue(undefined),
		subscribe: jest.fn().mockResolvedValue({ queue: 'q', messageCount: 0, consumerCount: 1 }),
		unsubscribe: jest.fn().mockResolvedValue(undefined)
	};
}

describe('RabbitMqEventBridge', () => {

	let gateway: ReturnType<typeof createGateway>;
	let eventPublishErrorHandler: jest.Mock;
	let eventDispatcher: { dispatch: jest.Mock };
	let get: jest.Mock;
	let bridge: RabbitMqEventBridge;

	beforeEach(() => {
		gateway = createGateway();
		eventPublishErrorHandler = jest.fn();
		eventDispatcher = { dispatch: jest.fn().mockResolvedValue([]) };
		get = jest.fn((alias: string) => (alias === 'eventDispatcher' ? eventDispatcher : undefined));
		bridge = new RabbitMqEventBridge({
			rabbitMqGateway: gateway as any,
			eventPublishErrorHandler,
			get
		});
	});

	it('does not resolve the event dispatcher on construction', () => {
		expect(get).not.toHaveBeenCalled();
	});

	it('is an event feed and a dispatch pipeline processor', () => {
		expect(isEventFeed(bridge)).toBe(true);
		expect(isDispatchPipelineProcessor(bridge)).toBe(true);
	});

	it('requires a gateway', () => {
		expect(() => new RabbitMqEventBridge({ get } as any)).toThrow('rabbitMqGateway');
	});

	it('requires the container get method', () => {
		expect(() => new RabbitMqEventBridge({ rabbitMqGateway: gateway } as any)).toThrow('get');
	});

	describe('process()', () => {

		it('publishes events to the default exchange with their meta', async () => {
			const batch = [{ event: { id: 'e1', type: 'created' }, origin: 'internal', custom: 1 }];

			await expect(bridge.process(batch)).resolves.toBe(batch);

			expect(gateway.publish).toHaveBeenCalledWith(RabbitMqEventBus.DEFAULT_EXCHANGE,
				{ id: 'e1', type: 'created' },
				{ origin: 'internal', custom: 1 });
		});

		it('publishes to a configured exchange', async () => {
			bridge = new RabbitMqEventBridge({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBridgeConfig: async () => ({ exchange: 'app.events' }),
				get
			});

			await bridge.process([{ event: { id: 'e1', type: 'created' } }]);

			expect(gateway.publish).toHaveBeenCalledWith('app.events', expect.anything(), expect.anything());
		});

		it('waits for the broker to confirm publishing', async () => {
			const confirmed = new Deferred<void>();
			gateway.publish.mockReturnValue(confirmed.promise);

			let processed = false;
			const processing = bridge.process([{ event: { id: 'e1', type: 'created' } }]).then(() => {
				processed = true;
			});
			await new Promise(setImmediate);
			expect(processed).toBe(false);

			confirmed.resolve();
			await processing;
			expect(processed).toBe(true);
		});

		it('publishes events of a batch in order', async () => {
			await bridge.process([
				{ event: { id: 'e1', type: 'created' } },
				{ event: { id: 'e2', type: 'updated' } }
			]);

			expect(gateway.publish.mock.calls.map(([, event]) => event.id)).toEqual(['e1', 'e2']);
		});

		it('reports publish failures without rejecting', async () => {
			const error = new Error('broker unavailable');
			gateway.publish.mockRejectedValue(error);

			await expect(bridge.process([{ event: { id: 'e1', type: 'created' } }])).resolves.toBeDefined();

			expect(eventPublishErrorHandler).toHaveBeenCalledWith(error);
		});

		it('rejects when the publish error handler throws', async () => {
			gateway.publish.mockRejectedValue(new Error('broker unavailable'));
			eventPublishErrorHandler.mockImplementation(error => {
				throw error;
			});

			await expect(bridge.process([{ event: { id: 'e1', type: 'created' } }])).rejects.toThrow('broker unavailable');
		});

		it('rejects without reporting when throwOnPublishError is set', async () => {
			bridge = new RabbitMqEventBridge({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBridgeConfig: { throwOnPublishError: true },
				eventPublishErrorHandler,
				get
			});
			gateway.publish.mockRejectedValueOnce(new Error('broker unavailable'));

			await expect(bridge.process([
				{ event: { id: 'e1', type: 'created' } },
				{ event: { id: 'e2', type: 'updated' } }
			])).rejects.toThrow('broker unavailable');

			expect(gateway.publish).toHaveBeenCalledTimes(1);
			expect(eventPublishErrorHandler).not.toHaveBeenCalled();
		});

		it('logs publish failures when no error handler is configured', async () => {
			const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() };
			bridge = new RabbitMqEventBridge({ rabbitMqGateway: gateway as any, logger: logger as any, get });
			gateway.publish.mockRejectedValue(new Error('broker unavailable'));

			await bridge.process([{ event: { id: 'e1', type: 'created' } }]);

			expect(logger.error).toHaveBeenCalledWith(expect.any(String),
				expect.objectContaining({ error: expect.any(Error) }));
		});

		it('skips snapshots and envelopes without events', async () => {
			await bridge.process([
				{ event: { type: 'snapshot', aggregateId: 1, aggregateVersion: 1, payload: {} } as any },
				{ origin: 'internal' }
			]);

			expect(gateway.publish).not.toHaveBeenCalled();
		});

		it('throws without publishing when the batch contains events of another origin', async () => {
			await expect(bridge.process([
				{ event: { id: 'e1', type: 'created' }, origin: 'internal' },
				{ event: { id: 'e2', type: 'created' }, origin: 'external' }
			])).rejects.toThrow('received "external"');

			expect(gateway.publish).not.toHaveBeenCalled();
		});

		it('publishes events without origin', async () => {
			await bridge.process([{ event: { id: 'e1', type: 'created' } }]);

			expect(gateway.publish).toHaveBeenCalledTimes(1);
		});
	});

	describe('startEventFeed()', () => {

		it('subscribes to all events of the exchange, ignoring own messages', async () => {
			bridge = new RabbitMqEventBridge({
				rabbitMqGateway: gateway as any,
				rabbitMqEventBridgeConfig: { queueName: 'node-1.feed', concurrentLimit: 10, deadLetterQueue: true },
				get
			});

			await bridge.startEventFeed();

			expect(gateway.subscribe).toHaveBeenCalledWith(expect.objectContaining({
				exchange: RabbitMqEventBus.DEFAULT_EXCHANGE,
				queueName: 'node-1.feed',
				concurrentLimit: 10,
				deadLetterQueue: true,
				eventType: '*',
				ignoreOwn: true,
				handler: expect.any(Function)
			}));
		});

		it('dispatches each message with the default feed origin and resolves once it is dispatched', async () => {
			const dispatched = new Deferred<unknown>();
			eventDispatcher.dispatch.mockReturnValue(dispatched.promise);
			await bridge.startEventFeed();
			const [{ handler }] = gateway.subscribe.mock.calls[0];

			let handled = false;
			const handling = Promise.resolve(handler({ id: 'e1', type: 'created' }, { otelSpan: undefined }))
				.then(() => {
					handled = true;
				});
			await Promise.resolve();

			expect(eventDispatcher.dispatch).toHaveBeenCalledWith([{ id: 'e1', type: 'created' }],
				{ otelSpan: undefined, origin: 'external' });
			expect(handled).toBe(false);

			dispatched.resolve([]);
			await handling;
			expect(handled).toBe(true);
		});

		it('dispatches messages with the injected feed origin', async () => {
			bridge = new RabbitMqEventBridge({ rabbitMqGateway: gateway as any, eventFeedOrigin: 'replica', get });
			await bridge.startEventFeed();
			const [{ handler }] = gateway.subscribe.mock.calls[0];

			await handler({ id: 'e1', type: 'created' });

			expect(eventDispatcher.dispatch).toHaveBeenCalledWith(expect.anything(), { origin: 'replica' });
		});

		it('rejects the message when the dispatch fails', async () => {
			eventDispatcher.dispatch.mockRejectedValue(new Error('pipeline failed'));
			await bridge.startEventFeed();
			const [{ handler }] = gateway.subscribe.mock.calls[0];

			await expect(handler({ id: 'e1', type: 'created' })).rejects.toThrow('pipeline failed');
		});

		it('requires an event dispatcher', async () => {
			bridge = new RabbitMqEventBridge({ rabbitMqGateway: gateway as any, get: () => undefined as any });
			await expect(bridge.startEventFeed()).rejects.toThrow('eventDispatcher is required');
		});

		it('subscribes once', async () => {
			await bridge.startEventFeed();
			await bridge.startEventFeed();

			expect(gateway.subscribe).toHaveBeenCalledTimes(1);
		});
	});

	describe('stopEventFeed()', () => {

		it('removes the subscription', async () => {
			await bridge.startEventFeed();
			const [subscription] = gateway.subscribe.mock.calls[0];

			await bridge.stopEventFeed();

			expect(gateway.unsubscribe).toHaveBeenCalledWith(subscription);
		});

		it('does nothing when not started', async () => {
			await bridge.stopEventFeed();
			expect(gateway.unsubscribe).not.toHaveBeenCalled();
		});
	});
});
