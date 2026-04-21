import * as amqplib from 'amqplib';
import { RabbitMqCommandBus } from '../../../src/rabbitmq/RabbitMqCommandBus';
import { RabbitMqGateway } from '../../../src/rabbitmq/RabbitMqGateway';
import type { ICommand } from '../../../src/interfaces';
import { delay } from './utils';

describe('RabbitMqCommandBus', () => {

	let gateway1: RabbitMqGateway;
	let gateway2: RabbitMqGateway;
	let gateway3: RabbitMqGateway;
	let commandBus1: RabbitMqCommandBus;
	let commandBus2: RabbitMqCommandBus;
	let commandBus3: RabbitMqCommandBus;

	let exchangeName: string;
	let queueName: string;
	let defaultQueueName: string;
	let defaultExchangeName: string;
	const commandType = 'test.command';
	const rabbitMqConnectionFactory = () => amqplib.connect('amqp://localhost');
	const originalDefaultQueueName = RabbitMqCommandBus.DEFAULT_QUEUE_NAME;
	const originalDefaultExchange = RabbitMqCommandBus.DEFAULT_EXCHANGE;

	beforeEach(async () => {
		const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
		exchangeName = `test-command-exchange.${suffix}`;
		queueName = `test-command-queue.${suffix}`;
		defaultQueueName = `test-command-default.${suffix}`;
		defaultExchangeName = `test-command-default-exchange.${suffix}`;

		RabbitMqCommandBus.DEFAULT_EXCHANGE = defaultExchangeName;
		RabbitMqCommandBus.DEFAULT_QUEUE_NAME = defaultQueueName;

		gateway1 = new RabbitMqGateway({ rabbitMqConnectionFactory });
		gateway2 = new RabbitMqGateway({ rabbitMqConnectionFactory });
		gateway3 = new RabbitMqGateway({ rabbitMqConnectionFactory });

		commandBus1 = new RabbitMqCommandBus({
			rabbitMqGateway: gateway1,
			rabbitMqCommandBusConfig: { exchange: exchangeName, queueName }
		});
		commandBus2 = new RabbitMqCommandBus({
			rabbitMqGateway: gateway2,
			rabbitMqCommandBusConfig: { exchange: exchangeName, queueName }
		});
		commandBus3 = new RabbitMqCommandBus({
			rabbitMqGateway: gateway3,
			rabbitMqCommandBusConfig: { exchange: exchangeName, queueName }
		});
	});

	afterEach(async () => {
		RabbitMqCommandBus.DEFAULT_EXCHANGE = originalDefaultExchange;
		RabbitMqCommandBus.DEFAULT_QUEUE_NAME = originalDefaultQueueName;

		if (gateway1.connection) {
			const ch = await gateway1.connection.createChannel();
			await ch.deleteQueue(queueName);
			await ch.deleteQueue(`${queueName}.failed`);
			await ch.deleteQueue(defaultQueueName);
			await ch.deleteQueue(`${defaultQueueName}.failed`);
			await ch.deleteExchange(exchangeName);
			await ch.deleteExchange(defaultExchangeName);
		}

		await gateway1.disconnect();
		await gateway2.disconnect();
		await gateway3.disconnect();
	});

	describe('send()', () => {

		it('publishes without throwing', async () => {

			await commandBus1.send({
				type: commandType,
				payload: { ok: true }
			});
		});
	});

	describe('on()', () => {

		it('delivers commands to only one consumer on the durable queue', async () => {
			const received1: ICommand[] = [];
			const received2: ICommand[] = [];

			await commandBus1.on(commandType, cmd => {
				received1.push(cmd as ICommand);
			});
			await commandBus2.on(commandType, cmd => {
				received2.push(cmd as ICommand);
			});

			const command: ICommand = {
				type: commandType,
				payload: { once: true }
			};

			await commandBus3.send(command);
			await delay(50);

			expect([...received1, ...received2]).toEqual([command]);
		});

		it('uses DEFAULT_QUEUE_NAME when queueName is not configured', async () => {
			const defaultQueueBus1 = new RabbitMqCommandBus({
				rabbitMqGateway: gateway1,
				rabbitMqCommandBusConfig: { exchange: defaultExchangeName }
			});
			const defaultQueueBus2 = new RabbitMqCommandBus({
				rabbitMqGateway: gateway2,
				rabbitMqCommandBusConfig: { exchange: defaultExchangeName }
			});

			const received: ICommand[] = [];

			await defaultQueueBus1.on(commandType, cmd => {
				received.push(cmd as ICommand);
			});

			await defaultQueueBus2.send({
				type: commandType,
				payload: { defaultQueue: true }
			});
			await delay(50);

			expect(received).toEqual([{
				type: commandType,
				payload: { defaultQueue: true }
			}]);

			const ch = await gateway1.connection.createChannel();
			const reply = await ch.checkQueue(defaultQueueName);
			expect(reply.queue).toBe(defaultQueueName);
		});

		it('can be created without any config', async () => {
			const defaultBus1 = new RabbitMqCommandBus({
				rabbitMqGateway: gateway1
			});
			const defaultBus2 = new RabbitMqCommandBus({
				rabbitMqGateway: gateway2
			});

			const received: ICommand[] = [];

			await defaultBus1.on(commandType, cmd => {
				received.push(cmd as ICommand);
			});

			await defaultBus2.send({
				type: commandType,
				payload: { noConfig: true }
			});
			await delay(50);

			expect(received).toEqual([{
				type: commandType,
				payload: { noConfig: true }
			}]);

			const ch = await gateway1.connection.createChannel();
			const queueReply = await ch.checkQueue(defaultQueueName);
			expect(queueReply.queue).toBe(defaultQueueName);
		});
	});

	describe('off()', () => {

		it('removes previously added handler', async () => {
			const received1: ICommand[] = [];
			const received2: ICommand[] = [];

			const handler1 = (cmd: ICommand) => received1.push(cmd);
			const handler2 = (cmd: ICommand) => received2.push(cmd);

			await commandBus1.on(commandType, handler1);
			await commandBus2.on(commandType, handler2);
			await commandBus2.off(commandType, handler2);

			const command: ICommand = {
				type: commandType,
				payload: { removed: true }
			};

			await commandBus3.send(command);
			await delay(50);

			expect(received1).toEqual([command]);
			expect(received2).toEqual([]);
		});
	});
});
