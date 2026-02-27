import {
	InMemorySnapshotStorage,
	ContainerBuilder,
	IContainer,
	InMemoryEventStorage
} from '../../src';

describe('eventDispatchPipeline', () => {

	let container: IContainer;

	const testEvent = {
		type: 'test-event',
		aggregateId: '123',
		payload: { data: 'test-payload' },
		id: 'test-id-123'
	};

	beforeEach(() => {
		const builder = new ContainerBuilder();

		builder.register(InMemoryEventStorage);
		builder.register(InMemorySnapshotStorage);
		builder.register((c: IContainer) => [
			c.eventStorage,
			c.snapshotStorage
		]).as('eventDispatchPipeline');

		container = builder.container() as IContainer;
	});

	it('delivers all events to eventStorage', async () => {

		const { eventDispatcher, eventStorage } = container;
		const storage = eventStorage as InMemoryEventStorage;

		jest.spyOn(storage, 'commitEvents');

		await eventDispatcher.dispatch([testEvent], { origin: 'internal' });
		await eventDispatcher.dispatch([testEvent], { origin: 'external' });

		expect(storage.commitEvents).toHaveBeenCalledTimes(2);
		expect(storage.commitEvents).toHaveBeenNthCalledWith(1, [testEvent]);
		expect(storage.commitEvents).toHaveBeenNthCalledWith(2, [testEvent]);
	});


	it('delivers all events to eventBus', async () => {

		const { eventDispatcher, eventBus } = container;

		jest.spyOn(eventBus, 'publish');

		await eventDispatcher.dispatch([testEvent], { origin: 'internal' });
		await eventDispatcher.dispatch([testEvent], { origin: 'external' });

		expect(eventBus.publish).toHaveBeenCalledTimes(2);
		expect(eventBus.publish).toHaveBeenNthCalledWith(1, testEvent, { origin: 'internal' });
		expect(eventBus.publish).toHaveBeenNthCalledWith(2, testEvent, { origin: 'external' });
	});
});
