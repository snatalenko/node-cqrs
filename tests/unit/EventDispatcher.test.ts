import { IEvent, IEventBus, IDispatchPipelineProcessor } from '../../src';
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

		const processorMock: IDispatchPipelineProcessor = {
			process: jest.fn(batch => Promise.resolve(batch))
		};

		dispatcher.addPipelineProcessor(processorMock);
		const result = await dispatcher.dispatch([event1, event2]);

		expect(processorMock.process).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).toHaveBeenCalledTimes(2);
		expect(eventBus.publish).toHaveBeenCalledWith(event1, {});
		expect(eventBus.publish).toHaveBeenCalledWith(event2, {});
		expect(result).toEqual([event1, event2]);
	});

	it('handles processor errors and invokes revert', async () => {

		const event: IEvent = { type: 'failing-event' };
		const error = new Error('processor error');

		const processorMock: IDispatchPipelineProcessor = {
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

		const processorA: IDispatchPipelineProcessor = {
			process: jest.fn(async batch => {
				executionOrder.push(`A-start-${batch[0].event.type}`);
				await new Promise(res => setTimeout(res, 5));
				executionOrder.push(`A-end-${batch[0].event.type}`);
				return batch;
			})
		};

		const processorB: IDispatchPipelineProcessor = {
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

	it('routes events to pipelines based on meta.origin', async () => {

		const internalProcessor: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };
		const externalProcessor: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };

		dispatcher = new EventDispatcher({
			eventBus,
			eventDispatchPipelines: {
				internal: [internalProcessor],
				external: [externalProcessor]
			}
		});

		const internalEvent: IEvent = { type: 'int' };
		const externalEvent: IEvent = { type: 'ext' };

		await dispatcher.dispatch([internalEvent], { origin: 'internal' });
		await dispatcher.dispatch([externalEvent], { origin: 'external' });

		expect(internalProcessor.process).toHaveBeenCalledTimes(1);
		expect(externalProcessor.process).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).toHaveBeenCalledWith(internalEvent, { origin: 'internal' });
		expect(eventBus.publish).toHaveBeenCalledWith(externalEvent, { origin: 'external' });
	});

	it('routes events according to eventDispatchRouter if provided', async () => {
		const p1: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };
		const p2: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };

		dispatcher = new EventDispatcher({
			eventBus,
			eventDispatchPipelines: {
				p1: [p1],
				p2: [p2]
			},
			eventDispatchRouter: (_events, meta) => meta?.route
		});

		const e1: IEvent = { type: 'r1' };
		const e2: IEvent = { type: 'r2' };

		await dispatcher.dispatch([e1], { route: 'p1' } as any);
		await dispatcher.dispatch([e2], { route: 'p2' } as any);

		expect(p1.process).toHaveBeenCalledTimes(1);
		expect(p2.process).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).toHaveBeenCalledWith(e1, { route: 'p1' });
		expect(eventBus.publish).toHaveBeenCalledWith(e2, { route: 'p2' });
	});

	it('routes events to default pipeline when no router is defined', async () => {
		const pDefault: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };
		const pOther: IDispatchPipelineProcessor = { process: jest.fn(async b => b) };

		dispatcher = new EventDispatcher({
			eventBus,
			eventDispatchPipelines: {
				[EventDispatcher.DEFAULT_PIPELINE]: [pDefault],
				other: [pOther]
			}
		});

		const e: IEvent = { type: 'go-default' };
		await dispatcher.dispatch([e]);

		expect(pDefault.process).toHaveBeenCalledTimes(1);
		expect(pOther.process).not.toHaveBeenCalled();
		expect(eventBus.publish).toHaveBeenCalledWith(e, {});
	});

	it('throws when targeted pipeline is missing (router or default)', async () => {
		const e: IEvent = { type: 'missing' };

		// Case 1: router selects a non-existent pipeline
		let d = new EventDispatcher({
			eventBus,
			eventDispatchPipelines: {
				foo: []
			},
			eventDispatchRouter: () => 'missing-pipe'
		});
		await expect(d.dispatch([e], {})).rejects.toThrow('No "missing-pipe" pipeline configured');

		// Case 2: no router/meta, default pipeline not provided
		d = new EventDispatcher({
			eventBus,
			eventDispatchPipelines: { other: [] }
		});
		await expect(d.dispatch([e])).rejects.toThrow('No "default" pipeline configured');
	});
});
