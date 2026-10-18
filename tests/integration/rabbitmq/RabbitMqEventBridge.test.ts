import * as amqplib from 'amqplib';
import {
	AbstractProjection,
	ContainerBuilder,
	InMemoryEventStorage,
	InMemoryView,
	type IContainer,
	type IDispatchPipelineProcessor,
	type IEvent
} from '../../../src/index.ts';
import { RabbitMqEventBridge, RabbitMqGateway } from '../../../src/rabbitmq/index.ts';
import { delay } from './utils/index.ts';

const exchange = 'test-bridge-exchange';
const queueName = 'test-bridge-queue';

interface NodeContainer extends IContainer {
	usersView: InMemoryView<{ name: string }>;
	rabbitMqGateway: RabbitMqGateway;
}

class UsersProjection extends AbstractProjection<InMemoryView<{ name: string }>> {
	userCreated({ aggregateId, payload }: IEvent<{ name: string }>) {
		this.view.create(aggregateId!, payload!);
	}
}

async function waitUntil(condition: () => Promise<boolean> | boolean, timeout = 5_000) {
	const deadline = Date.now() + timeout;
	while (!await condition()) {
		if (Date.now() > deadline)
			throw new Error('Timed out waiting for condition');
		await delay(20);
	}
}

describe('RabbitMqEventBridge', () => {

	let eventStorage: InMemoryEventStorage;
	const containers: NodeContainer[] = [];

	function createNode(options?: {
		queueName?: string,
		pipeline?: IDispatchPipelineProcessor[],
		throwOnPublishError?: boolean
	}) {
		const builder = new ContainerBuilder<NodeContainer>();
		builder.registerInstance(eventStorage);
		builder.registerInstance(new RabbitMqGateway({
			rabbitMqConnectionFactory: () => amqplib.connect('amqp://localhost')
		}), 'rabbitMqGateway');
		builder.registerInstance({
			exchange,
			throwOnPublishError: options?.throwOnPublishError,
			...options?.queueName && { queueName: options.queueName, deadLetterQueue: true }
		}, 'rabbitMqEventBridgeConfig');
		builder.registerEventFeed(RabbitMqEventBridge, { pipeline: options?.pipeline ?? [] }).as('rabbitMqEventBridge');
		builder.register(c => [...c.defaultEventDispatchPipeline, c.rabbitMqEventBridge!]).as('eventDispatchPipeline');
		builder.registerProjection(UsersProjection, 'usersView');

		const container = builder.container();
		containers.push(container);
		return container;
	}

	beforeEach(() => {
		eventStorage = new InMemoryEventStorage();
	});

	afterEach(async () => {
		const nodes = containers.splice(0);
		for (const node of nodes) {
			for (const feed of node.eventFeeds ?? [])
				await feed.stopEventFeed();
			await node.eventStore.drain();
		}

		const channel = await nodes[0].rabbitMqGateway.connection.createChannel();
		await channel.deleteQueue(queueName);
		await channel.deleteQueue(`${queueName}.failed`);
		await channel.deleteExchange(exchange);
		await channel.deleteExchange(`${exchange}.failed`);
		await channel.close();

		for (const node of nodes)
			await node.rabbitMqGateway.disconnect();
	});

	async function startNodes(...nodes: NodeContainer[]) {
		const views = nodes.map(node => node.usersView);
		await Promise.all(nodes.flatMap(node => node.restorePromises!));
		return views;
	}

	it('publishes committed events and delivers them to other instances only', async () => {
		const nodeA = createNode();
		const nodeB = createNode();
		const [viewA, viewB] = await startNodes(nodeA, nodeB);
		const publishB = jest.spyOn(nodeB.rabbitMqGateway, 'publish');
		const projectA = jest.spyOn(UsersProjection.prototype, 'userCreated');

		await nodeA.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }]);

		await waitUntil(async () => !!await viewB.get('alice'));
		await delay(200);

		expect(await viewA.get('alice')).toEqual({ name: 'Alice' });
		expect(projectA).toHaveBeenCalledTimes(2); // once on each instance
		expect(publishB).not.toHaveBeenCalled();

		projectA.mockRestore();
	});

	it('does not reject the dispatch when publishing fails', async () => {
		const nodeA = createNode();
		const [viewA] = await startNodes(nodeA);
		jest.spyOn(nodeA.rabbitMqGateway, 'publish').mockRejectedValue(new Error('broker unavailable'));

		await expect(nodeA.eventStore.dispatch([
			{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }
		])).resolves.toHaveLength(1);

		await waitUntil(async () => !!await viewA.get('alice'));
	});

	it('rejects the dispatch without local delivery when publishing fails and throwOnPublishError is set', async () => {
		const nodeA = createNode({ throwOnPublishError: true });
		const [viewA] = await startNodes(nodeA);
		jest.spyOn(nodeA.rabbitMqGateway, 'publish').mockRejectedValue(new Error('broker unavailable'));

		await expect(nodeA.eventStore.dispatch([
			{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }
		])).rejects.toThrow('broker unavailable');

		await nodeA.eventStore.drain();
		await delay(100);
		expect(viewA.has('alice')).toBe(false);
	});

	it('rejects the message when the feed pipeline fails', async () => {
		const failingProcessor: IDispatchPipelineProcessor = {
			process: jest.fn().mockRejectedValue(new Error('replication failed'))
		};
		const nodeA = createNode();
		const nodeB = createNode({ queueName, pipeline: [failingProcessor] });
		await startNodes(nodeA, nodeB);

		await nodeA.eventStore.dispatch([{ type: 'userCreated', aggregateId: 'alice', payload: { name: 'Alice' } }]);

		const channel = await nodeA.rabbitMqGateway.connection.createChannel();
		try {
			await waitUntil(async () => (await channel.checkQueue(`${queueName}.failed`)).messageCount === 1);
		}
		finally {
			await channel.close();
		}
		expect(failingProcessor.process).toHaveBeenCalledTimes(1);
	});
});
