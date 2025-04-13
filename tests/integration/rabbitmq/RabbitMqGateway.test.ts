import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import { IMessage } from '../../../src/interfaces';
import * as amqplib from 'amqplib';
import { delay } from '../../../src/utils';
import { Deferred } from '../../../src/utils/Deferred';
import { EventEmitter } from 'stream';

describe('RabbitMqGateway', () => {

	let gateway1: RabbitMqGateway;
	let gateway2: RabbitMqGateway | undefined;
	let gateway3: RabbitMqGateway | undefined;
	const exchange = 'test-exchange';
	const queueName = 'test-queue';
	const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');

	let process: EventEmitter;

	beforeEach(async () => {
		// const logger = console;
		const logger = undefined;

		process = new EventEmitter();
		gateway1 = new RabbitMqGateway({ rabbitMqConnectionFactory, logger, process: process as NodeJS.Process });
		gateway2 = new RabbitMqGateway({ rabbitMqConnectionFactory, logger, process: process as NodeJS.Process });
		gateway3 = new RabbitMqGateway({ rabbitMqConnectionFactory, logger, process: process as NodeJS.Process });
	});

	afterEach(async () => {
		if (gateway1.connection) {
			const ch = await gateway1.connection.createChannel();
			await ch.deleteQueue(queueName);
			await ch.deleteQueue(`${queueName}.failed`);
			await ch.deleteExchange(exchange);
			await gateway1.disconnect();
		}
		await gateway2?.disconnect();
		await gateway3?.disconnect();
	});

	describe('publish()', () => {

		it('publishes without throwing', async () => {

			const message: IMessage = {
				type: 'test.confirm',
				payload: { msg: 'confirmed' }
			};

			await gateway1.publish(exchange, message);
		});
	});


	describe('subscribeToFanout', () => {

		it('ignores self-published messages', async () => {
			const received: IMessage[] = [];

			await gateway1.subscribeToFanout(exchange, msg => {
				received.push(msg);
			});

			const message: IMessage = {
				type: 'test.event',
				payload: { msg: 'self-test' }
			};

			// publish from the same instance — should be ignored
			await gateway1.publish(exchange, message);

			await delay(50); // wait briefly

			expect(received).toHaveLength(0);
		});

		it('receives messages sent from external source', async () => {
			const received: IMessage[] = [];

			await gateway1.subscribeToFanout(exchange, msg => {
				received.push(msg);
			});

			gateway3 = new RabbitMqGateway({
				rabbitMqConnectionFactory: () => amqplib.connect('amqp://localhost')
			});

			const message: IMessage = {
				type: 'test.event',
				payload: { from: 'external' }
			};

			gateway3.publish(exchange, message);
			await delay(50); // allow time for delivery

			expect(received).toHaveLength(1);
			expect(received[0].payload.from).toBe('external');

			await gateway3.connection.close();
		});

		it('delivers fanout messages to multiple non-queue subscribers', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			await gateway2.subscribeToFanout(exchange, msg => received1.push(msg));
			await gateway3.subscribeToFanout(exchange, msg => received2.push(msg));

			const message: IMessage = {
				type: 'test.event',
				payload: { test: 'multi' }
			};

			await gateway1.publish(exchange, message);
			await delay(50);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});
	});

	describe('subscribeToQueue', () => {

		it('delivers locally published messages to durable queue subscription', async () => {
			const received: IMessage[] = [];
			await gateway1.subscribeToQueue(exchange, queueName, msg => received.push(msg));

			const message: IMessage = {
				type: 'queue.event',
				payload: { local: true }
			};

			await gateway1.publish(exchange, message);
			await delay(50);

			expect(received).toHaveLength(1);
			expect(received[0].payload.local).toBe(true);
		});

		it('delivers queue messages to one consumer only', async () => {
			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			await gateway1.subscribeToQueue(exchange, queueName, msg => received1.push(msg));

			gateway3 = new RabbitMqGateway({
				rabbitMqConnectionFactory: () => amqplib.connect('amqp://localhost')
			});
			await gateway3.subscribeToQueue(exchange, queueName, msg => received2.push(msg));

			const message: IMessage = {
				type: 'queue.once',
				payload: { value: 1 }
			};

			await gateway1.publish(exchange, message);
			await new Promise(res => setTimeout(res, 100));

			const totalReceived = received1.length + received2.length;
			expect(totalReceived).toBe(1);
		});

		it('sends failed queue messages to DLQ', async () => {
			const dlqReceived: IMessage[] = [];

			await gateway1.subscribeToQueue(exchange, queueName, _msg => {
				throw new Error('intentional failure');
			});

			const cn2 = await amqplib.connect('amqp://localhost');
			const ch2 = await cn2.createChannel();
			await ch2.consume(`${queueName}.failed`, msg => {
				dlqReceived.push(JSON.parse(msg.content.toString()));
			});

			const message: IMessage = {
				type: 'dlq.test',
				payload: { shouldFail: true }
			};

			await gateway1.publish(exchange, message);
			await delay(50);

			expect(dlqReceived).toHaveLength(1);
			expect(dlqReceived[0].payload.shouldFail).toBe(true);

			await cn2.close();
		});
	});

	describe('subscribe', () => {

		it('subscribes to specific event type broadcast when eventType is defined', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			const event1 = { type: 'event1' };
			const event2 = { type: 'event2' };
			const event3 = { type: 'event3' };

			await gateway1.subscribe({ exchange, eventType: event1.type, handler: e => received1.push(e) });
			await gateway1.subscribe({ exchange, eventType: event2.type, handler: e => received1.push(e) });
			await gateway2.subscribe({ exchange, eventType: event2.type, handler: e => received2.push(e) });
			await gateway2.subscribe({ exchange, eventType: event3.type, handler: e => received2.push(e) });

			await gateway3.publish(exchange, event1);
			await gateway3.publish(exchange, event2);
			await gateway3.publish(exchange, event3);

			await delay(50);

			expect(received1).toEqual([event1, event2]);
			expect(received2).toEqual([event2, event3]);
		});

		it('subscribe queue to given event types, when specified', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];
			const received3: IMessage[] = [];

			const event1 = { type: 'event1' };
			const event2 = { type: 'event2' };
			const event3 = { type: 'event3' };

			await gateway1.subscribe({ exchange, queueName, eventType: event1.type, handler: m => received1.push(m) });
			await gateway1.subscribe({ exchange, queueName, eventType: event2.type, handler: m => received2.push(m) });
			await gateway1.subscribe({ exchange, queueName, eventType: event3.type, handler: m => received3.push(m) });

			await gateway3.publish(exchange, event1);
			await gateway3.publish(exchange, event2);
			await gateway3.publish(exchange, event3);

			await delay(50);

			expect(received1).toEqual([event1]);
			expect(received2).toEqual([event2]);
		});

		it('allows to limit number of concurrently running message processors', async () => {

			// @ts-ignore
			const { promise: blocker, resolve: releaseBlocker } = Promise.withResolvers<void>();

			const received1: IMessage[] = [];
			const event1 = { type: 'event1' };

			await gateway1.subscribe({
				exchange,
				queueName,
				eventType: event1.type,
				handler: async m => {
					received1.push(m);
					await blocker;
				},
				concurrentLimit: 2
			});

			await gateway3.publish(exchange, event1);
			await gateway3.publish(exchange, event1);
			await gateway3.publish(exchange, event1);

			await delay(50);

			expect(received1).toEqual([event1, event1]);

			releaseBlocker();
			await delay(50);

			expect(received1).toEqual([event1, event1, event1]);
		});
	});

	describe('unsubscribe', () => {

		it('removes subscription so handler does not receive further events', async () => {

			const received: IMessage[] = [];
			const handler = (msg: IMessage) => {
				received.push(msg);
			};
			const event1 = {
				type: 'test.unsubscribe',
				payload: { info: 'first event' },
				context: { ts: Date.now() }
			};

			// Subscribe to a durable queue
			await gateway1.subscribeToQueue(exchange, queueName, handler);

			// Publish an event and verify handler is invoked
			await gateway1.publish(exchange, event1);
			await delay(50);

			expect(received).toEqual([event1]);

			await gateway1.unsubscribe({ exchange, queueName, handler });

			// Clear received messages
			received.length = 0;
			expect(received).toEqual([]);

			// Publish a second event; handler should not be invoked
			await gateway1.publish(exchange, event1);
			await delay(50);

			expect(received).toEqual([]);
		});

		it('cancels consumer when unsubscribing the last subscription on a queue', async () => {

			const processOnSpy = jest.spyOn(process, 'once');
			const processOffSpy = jest.spyOn(process, 'off');

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			const handler1 = (msg: IMessage) => {
				received1.push(msg);
			};
			const handler2 = (msg: IMessage) => {
				received2.push(msg);
			};

			const event1 = {
				type: 'test.unsubscribe',
				payload: { info: 'event for handler2' },
				context: { ts: Date.now() }
			};

			// Subscribe both handlers to the same durable queue
			await gateway1.subscribe({
				exchange,
				eventType: event1.type,
				handler: handler1
			});
			await gateway1.subscribe({
				exchange,
				eventType: event1.type,
				handler: handler2
			});

			expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
			expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
			expect(processOnSpy).toHaveBeenCalledTimes(2);
			expect(processOffSpy).not.toHaveBeenCalled();

			// Unsubscribe one handler; the queue should still be active
			await gateway1.unsubscribe({
				exchange,
				eventType: event1.type,
				handler: handler1
			});

			expect(processOffSpy).not.toHaveBeenCalled();

			// Publish an event; only handler2 should receive it

			await gateway1.publish(exchange, event1);
			await delay(50);

			expect(received1).toEqual([]);
			expect(received2).toEqual([event1]);

			// Now unsubscribe the last handler; this should cancel the consumer for the queue
			await gateway1.unsubscribe({
				exchange,
				eventType: event1.type,
				handler: handler2
			});

			expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

			// Publish a second event; no handler should receive it because the consumer is cancelled
			received2.length = 0;

			await gateway1.publish(exchange, event1);
			await delay(50);

			expect(received1).toEqual([]);
		});
	});

	describe('connect()', () => {

		it('retains subscriptions after reconnect', async () => {

			const fanoutReceived: IMessage[] = [];
			const queueReceived: IMessage[] = [];

			await gateway1.subscribeToFanout(exchange, msg => {
				fanoutReceived.push(msg);
			});

			await gateway1.subscribeToQueue(exchange, queueName, msg => {
				queueReceived.push(msg);
			});

			// Force disconnect to simulate dropped connection
			await gateway1.disconnect();
			await gateway1.connect();

			const message: IMessage = {
				type: 'test.reconnect',
				payload: { check: true }
			};

			gateway3 = new RabbitMqGateway({
				rabbitMqConnectionFactory: () => amqplib.connect('amqp://localhost')
			});

			await gateway3.publish(exchange, message);
			await delay(50);

			expect(fanoutReceived).toEqual([message]);
			expect(queueReceived).toEqual([message]);
		});

		it('stops receiving messages on SIGINT', async () => {

			const received: IMessage[] = [];
			const process = new EventEmitter();
			const handlerBlocker = new Deferred();
			const message: IMessage = {
				type: 'test.sigint',
				payload: { check: true }
			};

			gateway1 = new RabbitMqGateway({ rabbitMqConnectionFactory, process: process as any });

			await gateway1.subscribeToFanout(exchange, async msg => {
				await handlerBlocker.promise;
				received.push(msg);
			});

			gateway3 = new RabbitMqGateway({ rabbitMqConnectionFactory });

			await gateway3.publish(exchange, message);
			await delay(50);

			expect(received).toHaveLength(0);

			process.emit('SIGINT');
			await delay(10);

			expect(received).toHaveLength(0);

			handlerBlocker.resolve();
			await delay(10);

			expect(received).toHaveLength(1);
		});
	});
});
