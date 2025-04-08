import * as amqplib from 'amqplib';
import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import { RabbitMqEventInjector } from '../../../src/rabbitmq/RabbitMqEventInjector';
import { IEvent, IEventDispatcher } from '../../../src/interfaces';
import { jest } from '@jest/globals';
import { delay } from '../../../src/utils';

describe('RabbitMqEventInjector', () => {
	let rabbitMqGateway: RabbitMqGateway;
	let rabbitMqGateway2: RabbitMqGateway;
	let eventDispatcher: jest.Mocked<IEventDispatcher>;

	const exchange = 'node-cqrs.events';
	const eventType = 'test-injector-event';

	beforeEach(async () => {
		const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');
		rabbitMqGateway = new RabbitMqGateway({ rabbitMqConnectionFactory });
		rabbitMqGateway2 = new RabbitMqGateway({ rabbitMqConnectionFactory });

		eventDispatcher = {
			dispatch: jest.fn().mockResolvedValue(undefined)
		} as unknown as jest.Mocked<IEventDispatcher>;

		const injector = new RabbitMqEventInjector({ rabbitMqGateway, eventDispatcher });

		await injector.start(exchange);
	});

	afterEach(async () => {
		const ch = await rabbitMqGateway.connection?.createChannel();
		await ch.deleteExchange(exchange);
		await ch.close();
		await rabbitMqGateway.disconnect();
		await rabbitMqGateway2.disconnect();
	});

	it('does not receive messages published to own gateway', async () => {
		const testEvent: IEvent = {
			type: eventType,
			payload: { data: 'test-payload' },
			id: 'test-id-123'
		};

		await rabbitMqGateway.publish(exchange, testEvent);

		await delay(50);

		expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
	});

	it('receives messages published to other gateway, dispatches to eventDispatcher', async () => {
		const testEvent: IEvent = {
			type: eventType,
			payload: { data: 'test-payload' },
			id: 'test-id-123'
		};

		await rabbitMqGateway2.publish(exchange, testEvent);

		await delay(50);

		expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
		expect(eventDispatcher.dispatch).toHaveBeenCalledWith([testEvent]);
	});
});
