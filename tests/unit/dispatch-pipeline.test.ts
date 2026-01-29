import { InMemorySnapshotStorage } from '../../dist/cjs/in-memory/InMemorySnapshotStorage';
import {
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

		builder.register(InMemoryEventStorage).as('eventStorageWriter');
		builder.register(InMemorySnapshotStorage).as('snapshotStorage');
		builder.register((c: IContainer) => [
			c.eventStorageWriter,
			c.snapshotStorage
		]).as('eventDispatchPipeline');

		container = builder.container() as IContainer;
	});

	it('delivers all events to eventStorageWriter', async () => {

		const { eventDispatcher, eventStorageWriter } = container;

		jest.spyOn(eventStorageWriter, 'commitEvents');

		await eventDispatcher.dispatch([testEvent], { origin: 'internal' });
		await eventDispatcher.dispatch([testEvent], { origin: 'external' });

		expect(eventStorageWriter.commitEvents).toHaveBeenCalledTimes(2);
		expect(eventStorageWriter.commitEvents).toHaveBeenNthCalledWith(1, [testEvent]);
		expect(eventStorageWriter.commitEvents).toHaveBeenNthCalledWith(2, [testEvent]);
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
