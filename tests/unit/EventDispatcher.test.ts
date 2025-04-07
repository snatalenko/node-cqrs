import { IEvent, IEventBus, IEventProcessor } from '../../src';
import { EventDispatcher } from '../../src/EventDispatcher';

describe('EventDispatcher', () => {
	let dispatcher: EventDispatcher;
	let eventBus: jest.Mocked<IEventBus>;

	beforeEach(() => {
		eventBus = { publish: jest.fn() };
		dispatcher = new EventDispatcher({ eventBus });
	});

	it('dispatches events through processors and dispatches', async () => {

		const event1: IEvent = { type: 'test-event-1' };
		const event2: IEvent = { type: 'test-event-2' };

		const processorMock: IEventProcessor = {
			process: jest.fn(batch => Promise.resolve(batch))
		};

		dispatcher.addPipelineProcessor(processorMock);
		const result = await dispatcher.dispatch([event1, event2]);

		expect(processorMock.process).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).toHaveBeenCalledTimes(2);
		expect(eventBus.publish).toHaveBeenCalledWith(event1);
		expect(eventBus.publish).toHaveBeenCalledWith(event2);
		expect(result).toEqual([event1, event2]);
	});

	it('handles processor errors and invokes revert', async () => {

		const event: IEvent = { type: 'failing-event' };
		const error = new Error('processor error');

		const processorMock: IEventProcessor = {
			process: jest.fn().mockRejectedValue(error),
			revert: jest.fn().mockResolvedValue(undefined)
		};

		dispatcher.addPipelineProcessor(processorMock);

		await expect(dispatcher.dispatch([event])).rejects.toThrow('processor error');

		expect(processorMock.process).toHaveBeenCalledTimes(1);
		expect(processorMock.revert).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).not.toHaveBeenCalled();
	});

	it('throws if dispatch called with empty event array', async () => {

		await expect(dispatcher.dispatch([])).rejects.toThrow('dispatch requires a non-empty array of events');
	});

	it('runs multiple processors sequentially while processing batches in parallel', async () => {

		const executionOrder: string[] = [];

		const processorA: IEventProcessor = {
			process: jest.fn(async batch => {
				executionOrder.push(`A-start-${batch[0].event.type}`);
				await new Promise(res => setTimeout(res, 5));
				executionOrder.push(`A-end-${batch[0].event.type}`);
				return batch;
			})
		};

		const processorB: IEventProcessor = {
			process: jest.fn(async batch => {
				executionOrder.push(`B-start-${batch[0].event.type}`);
				await new Promise(res => setTimeout(res, 5));
				executionOrder.push(`B-end-${batch[0].event.type}`);
				return batch;
			})
		};

		dispatcher.addPipelineProcessor(processorA);
		dispatcher.addPipelineProcessor(processorB);

		const event1: IEvent = { type: 'event-1' };
		const event2: IEvent = { type: 'event-2' };

		await Promise.all([
			dispatcher.dispatch([event1]),
			dispatcher.dispatch([event2])
		]);

		expect(executionOrder).toEqual([
			'A-start-event-1',
			'A-start-event-2',
			'A-end-event-1',
			'B-start-event-1',
			'A-end-event-2',
			'B-start-event-2',
			'B-end-event-1',
			'B-end-event-2'
		]);
	});
});
