import * as amqplib from 'amqplib';
import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import { RabbitMqEventInjector } from '../../../src/rabbitmq/RabbitMqEventInjector';
import { IEvent, IEventDispatcher } from '../../../src/interfaces';
import { jest } from '@jest/globals';
import { delay } from '../../../src/utils';

describe('RabbitMqEventInjector', () => {
	let rabbitMqGateway: RabbitMqGateway;
	let eventDispatcher: jest.Mocked<IEventDispatcher>;

	const exchange = 'node-cqrs.events';
	const eventType = 'test-injector-event';

	beforeEach(async () => {
		const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');
		rabbitMqGateway = new RabbitMqGateway({ rabbitMqConnectionFactory });

		eventDispatcher = {
			dispatch: jest.fn().mockResolvedValue(undefined)
		} as unknown as jest.Mocked<IEventDispatcher>;

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const injector = new RabbitMqEventInjector({
			rabbitMqGateway,
			eventDispatcher,
			exchange
		});

		await delay(50); // Allow time for subscription setup
	});

	afterEach(async () => {
		try {
			const ch = await rabbitMqGateway.connection?.createChannel();
			if (ch) {
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

	it('receives messages and dispatches them via EventDispatcher', async () => {
		const testEvent: IEvent = {
			type: eventType,
			payload: { data: 'test-payload' },
			id: 'test-id-123'
		};

		await rabbitMqGateway.publish(exchange, testEvent);

		await delay(50);

		expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
		expect(eventDispatcher.dispatch).toHaveBeenCalledWith([testEvent]);
	});
});
