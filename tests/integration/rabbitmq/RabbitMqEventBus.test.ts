import * as amqplib from 'amqplib';
import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import { RabbitMqEventBus } from '../../../src/rabbitmq/RabbitMqEventBus';
import { IMessage, IEvent } from '../../../src/interfaces';

const delay = (ms: number) => new Promise(res => {
	const t = setTimeout(res, ms);
	t.unref();
});

describe('RabbitMqEventBus', () => {

	let gateway1: RabbitMqGateway;
	let gateway2: RabbitMqGateway;
	let gateway3: RabbitMqGateway;
	let eventBus1: RabbitMqEventBus;
	let eventBus2: RabbitMqEventBus;
	let eventBus3: RabbitMqEventBus;

	const queueName = 'test-bus-queue';
	const exchangeName = 'test-bus-exchange';
	const eventType = 'test-bus-event';

	beforeEach(async () => {
		const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');
		gateway1 = new RabbitMqGateway({ rabbitMqConnectionFactory });
		gateway2 = new RabbitMqGateway({ rabbitMqConnectionFactory });
		gateway3 = new RabbitMqGateway({ rabbitMqConnectionFactory });
		eventBus1 = new RabbitMqEventBus({ rabbitMqGateway: gateway1, exchange: exchangeName });
		eventBus2 = new RabbitMqEventBus({ rabbitMqGateway: gateway2, exchange: exchangeName });
		eventBus3 = new RabbitMqEventBus({ rabbitMqGateway: gateway3, exchange: exchangeName });
	});

	afterEach(async () => {
		const ch = await gateway1.connection.createChannel();
		await ch.deleteQueue(queueName);
		await ch.deleteQueue(`${queueName}.failed`);
		await ch.deleteExchange(exchangeName);
		await gateway1.disconnect();
		await gateway2.disconnect();
		await gateway3.disconnect();
	});

	describe('publish()', () => {

		it('publishes without throwing', async () => {

			await eventBus1.publish({ type: eventType });
		});
	});

	describe('on()', () => {

		it('subscribes to events so that they are delivered to every subscriber except sender', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];
			const received3: IMessage[] = [];

			await eventBus1.on(eventType, e => {
				received1.push(e);
			});

			await eventBus2.on(eventType, e => {
				received2.push(e);
			});

			await eventBus3.on(eventType, e => {
				received3.push(e);
			});

			const event: IEvent = {
				type: eventType,
				payload: { ok: true }
			};

			await eventBus2.publish(event);
			await delay(50);

			expect(received1).toEqual([event]);
			expect(received2).toEqual([]);
			expect(received3).toEqual([event]);
		});

		it('allows to subscribe to all events', async () => {

			const received1: IMessage[] = [];

			await eventBus1.on(RabbitMqEventBus.allEventsWildcard, e => {
				received1.push(e);
			});

			const event1: IEvent = { type: `${eventType}1` };
			const event2: IEvent = { type: `${eventType}2` };

			await eventBus2.publish(event1);
			await eventBus3.publish(event2);

			await delay(50);

			expect(received1).toEqual([event1, event2]);
		});
	});

	describe('queue()', () => {

		it('creates an isolated queue where published messages delivered to only one recipient', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			await eventBus1.queue(queueName).on(eventType, msg => {
				received1.push(msg);
			});

			await eventBus2.queue(queueName).on(eventType, msg => {
				received2.push(msg);
			});

			const event: IEvent = {
				type: eventType,
				payload: { ok: true }
			};

			await eventBus1.publish(event);
			await delay(50);

			expect([...received1, ...received2]).toEqual([
				event
			]);
		});

		it('allows to subscribe to all events in the queue', async () => {

			const received1: IMessage[] = [];
			const received2: IMessage[] = [];

			await eventBus1.queue(queueName).on(RabbitMqEventBus.allEventsWildcard, msg => {
				received1.push(msg);
			});

			await eventBus2.queue(queueName).on(RabbitMqEventBus.allEventsWildcard, msg => {
				received2.push(msg);
			});

			const event1: IEvent = {
				type: `${eventType}1`
			};

			const event2: IEvent = {
				type: `${eventType}2`
			};

			await eventBus1.publish(event1);
			await eventBus1.publish(event2);

			await delay(50);

			expect([...received1, ...received2]).toEqual([
				event1,
				event2
			]);
		});

	});

	describe('off()', () => {

		it('removes previously added handler', async () => {

			const received1: IMessage[] = [];
			const handler1 = (msg: IMessage) => received1.push(msg);
			await eventBus1.on(eventType, handler1);

			const received2: IMessage[] = [];
			const handler2 = (msg: IMessage) => received2.push(msg);
			await eventBus2.on(eventType, handler2);

			eventBus2.off(eventType, handler2);

			const event = { type: eventType, payload: { removed: true } };
			await eventBus3.publish(event);

			await delay(50);

			expect(received1).toEqual([event]);
			expect(received2).toEqual([]);
		});
	});
});
