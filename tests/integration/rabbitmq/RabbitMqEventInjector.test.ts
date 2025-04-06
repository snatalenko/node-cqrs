import * as amqplib from 'amqplib';
import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import { RabbitMqEventInjector } from '../../../src/rabbitmq/RabbitMqEventInjector';
import { IEvent, IEventDispatcher, IMessage } from '../../../src/interfaces';
import { jest } from '@jest/globals';
import { delay } from '../../../src/utils';

describe('RabbitMqEventInjector', () => {
	let rabbitMqGateway: RabbitMqGateway;
	let eventDispatcher: jest.Mocked<IEventDispatcher>;
	let injector: RabbitMqEventInjector;

	const exchange = 'node-cqrs.events';
	const queueName = 'test-injector-queue';
	const deadLetterQueueName = `${queueName}.failed`;
	const eventType = 'test-injector-event';

	beforeEach(async () => {
		const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');
		rabbitMqGateway = new RabbitMqGateway({ rabbitMqConnectionFactory });

		eventDispatcher = {
			dispatch: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<IEventDispatcher>;

		injector = new RabbitMqEventInjector({
			rabbitMqGateway,
			eventDispatcher,
			queueName,
			exchange
		});

		await delay(50); // Allow time for subscription setup
	});

	afterEach(async () => {
		try {
			const ch = await rabbitMqGateway.connection?.createChannel();
			if (ch) {
				await ch.deleteQueue(queueName);
				await ch.deleteQueue(`${queueName}.failed`);
				await ch.deleteExchange(exchange);
				await ch.close();
			}
		}
		catch (error) {
			console.warn('Error during RabbitMQ cleanup:', error);
		}
		finally {
			await rabbitMqGateway.disconnect();
		}
	});

	it('receives a message from the queue and dispatch it via EventDispatcher', async () => {
		const testEvent: IEvent = {
			type: eventType,
			payload: { data: 'test-payload' },
			id: 'test-id-123',
		};

		await rabbitMqGateway.publish(exchange, testEvent);

		await delay(50);

		expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
		expect(eventDispatcher.dispatch).toHaveBeenCalledWith([testEvent]);
	});

	it('handles errors during event dispatch and nack the message', async () => {
		const testEvent: IEvent = {
			type: 'error-event',
			payload: { data: 'trigger-error' },
			id: 'error-id-456',
		};
		const dispatchError = new Error('Dispatch failed');
		eventDispatcher.dispatch.mockRejectedValueOnce(dispatchError);

		// Publish the event
		await rabbitMqGateway.publish(exchange, testEvent);

		await delay(100);

		const ch = await rabbitMqGateway.connection!.createChannel();
		const deadLetterMessage = await ch.get(deadLetterQueueName, { noAck: true });
		if (!deadLetterMessage)
			throw new Error('Dead letter message not found');

		const messageContent = JSON.parse(deadLetterMessage.content.toString());
		expect(messageContent).toEqual(testEvent);
	});
});
