import {
	DispatchPipelineBatch,
	IEvent,
	IEventDispatcher,
	IDispatchPipelineProcessor,
	IEventSet,
	IEventBus,
	isEventSet,
	IContainer,
	isDispatchPipelineProcessor
} from './interfaces';
import { parallelPipe } from 'async-parallel-pipe';
import { AsyncIterableBuffer } from 'async-iterable-buffer';
import { getClassName, notEmpty } from './utils';
import { InMemoryMessageBus } from './in-memory';

type EventBatchEnvelope = {
	data: DispatchPipelineBatch<{ event?: IEvent }>;
	error?: Error;
	resolve: (event: IEvent[]) => void;
	reject: (error: Error) => void;
}

export class EventDispatcher implements IEventDispatcher {

	#pipelineInput = new AsyncIterableBuffer<EventBatchEnvelope>();
	#processors: Array<IDispatchPipelineProcessor> = [];
	#pipeline: AsyncIterableIterator<EventBatchEnvelope> | IterableIterator<EventBatchEnvelope> = this.#pipelineInput;

	/**
	 * Event bus where dispatched messages are delivered after processing.
	 *
	 * If not provided in the constructor, defaults to an instance of `InMemoryMessageBus`.
	 */
	eventBus: IEventBus;

	/**
	 * Maximum number of event batches that each pipeline processor can handle in parallel.
	 */
	concurrentLimit: number;

	constructor(o?: Pick<IContainer, 'eventBus' | 'eventDispatchPipeline'> & {
		eventDispatcherConfig?: {
			concurrentLimit?: number
		}
	}) {
		this.eventBus = o?.eventBus ?? new InMemoryMessageBus();
		this.concurrentLimit = o?.eventDispatcherConfig?.concurrentLimit ?? 100;

		if (o?.eventDispatchPipeline)
			this.addPipelineProcessors(o.eventDispatchPipeline);
	}

	addPipelineProcessors(eventDispatchPipeline: IDispatchPipelineProcessor[]) {
		if (!Array.isArray(eventDispatchPipeline))
			throw new TypeError('eventDispatchPipeline argument must be an Array');

		for (const processor of eventDispatchPipeline) {
			if (processor)
				this.addPipelineProcessor(processor);
		}
	}

	/**
	 * Adds a preprocessor to the event dispatch pipeline.
	 *
	 * Preprocessors run in order they are added but process separate batches in parallel, maintaining FIFO order.
	 */
	addPipelineProcessor(preprocessor: IDispatchPipelineProcessor) {
		if (!isDispatchPipelineProcessor(preprocessor))
			throw new TypeError(`preprocessor ${getClassName(preprocessor)} does not implement IDispatchPipelineProcessor`);
		if (this.#pipelineProcessing)
			throw new Error('pipeline processing already started');

		this.#processors.push(preprocessor);

		// Build a processing pipeline that runs preprocessors concurrently, preserving FIFO ordering
		this.#pipeline = parallelPipe(this.#pipeline, this.concurrentLimit, async envelope => {
			if (envelope.error)
				return envelope;

			try {
				return {
					...envelope,
					data: await preprocessor.process(envelope.data)
				};
			}
			catch (error: any) {
				return {
					...envelope,
					error
				};
			}
		});
	}

	#pipelineProcessing = false;

	/**
	 * Consume the pipeline, publish events, and resolve/reject each batch
	 */
	async #startPipelineProcessing() {
		if (this.#pipelineProcessing) // should never happen
			throw new Error('pipeline processing already started');

		this.#pipelineProcessing = true;

		for await (const { error, reject, data, resolve } of this.#pipeline) {
			if (error) { // some of the preprocessors failed
				await this.#revert(data);
				reject(error);
				continue;
			}

			const events = data.map(e => e.event).filter(notEmpty);

			try {
				for (const batch of data) {
					const { event, ...meta } = batch;
					if (event)
						this.eventBus.publish(event, meta);
				}

				resolve(events);
			}
			catch (publishError: any) {
				reject(publishError);
			}
		}
	}

	/**
	 * Revert side effects made by pipeline processors in case of a batch processing failure
	 */
	async #revert(batch: DispatchPipelineBatch) {
		for (const processor of this.#processors)
			await processor.revert?.(batch);
	}

	/**
	 * Dispatch a set of events through the processing pipeline.
	 *
	 * Returns a promise that resolves after all events are processed and published.
	 */
	async dispatch(events: IEventSet, meta?: Record<string, any>) {
		if (!isEventSet(events) || events.length === 0)
			throw new Error('dispatch requires a non-empty array of events');

		// const { promise, resolve, reject } = Promise.withResolvers<IEventSet>();
		let resolve!: (value: IEventSet | PromiseLike<IEventSet>) => void;
		let reject!: (reason?: any) => void;
		const promise = new Promise<IEventSet>((res, rej) => {
			resolve = res;
			reject = rej;
		});

		const envelope: EventBatchEnvelope = {
			data: events.map(event => ({
				event,
				...meta
			})),
			resolve,
			reject
		};

		if (!this.#pipelineProcessing)
			this.#startPipelineProcessing();

		this.#pipelineInput.push(envelope);

		return promise;
	}
}
