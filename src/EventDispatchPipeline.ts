import {
	type DispatchPipelineEnvelope,
	type DispatchPipelineBatch,
	type IEvent,
	type IDispatchPipelineProcessor,
	type IEventBus,
	isDispatchPipelineProcessor,
	isSnapshotEvent
} from './interfaces/index.ts';

import { parallelPipe } from 'async-parallel-pipe';
import { AsyncIterableBuffer } from 'async-iterable-buffer';
import { getClassName } from './utils/index.ts';

export type EventBatchEnvelope = {
	data: DispatchPipelineBatch<DispatchPipelineEnvelope>;
	error?: Error;
	resolve: (event: IEvent[]) => void;
	reject: (error: Error) => void;
};

export class EventDispatchPipeline {

	#pipelineInput = new AsyncIterableBuffer<EventBatchEnvelope>();
	#processors: Array<IDispatchPipelineProcessor> = [];
	#pipeline: AsyncIterableIterator<EventBatchEnvelope> | IterableIterator<EventBatchEnvelope> = this.#pipelineInput;
	#processing = false;
	#pending = new Set<Promise<unknown>>();

	readonly #eventBus;
	readonly #concurrentLimit: number;
	readonly #onError?: (error: Error) => void;

	constructor(eventBus: IEventBus, concurrentLimit: number, onError?: (error: Error) => void) {
		this.#eventBus = eventBus;
		this.#concurrentLimit = concurrentLimit;
		this.#onError = onError;
	}

	addProcessor(preprocessor: IDispatchPipelineProcessor) {
		if (!isDispatchPipelineProcessor(preprocessor))
			throw new TypeError(`preprocessor ${getClassName(preprocessor)} does not implement IDispatchPipelineProcessor`);
		if (this.#processing)
			throw new Error('pipeline processing already started');

		this.#processors.push(preprocessor);

		// Build a processing pipeline that runs preprocessors concurrently, preserving FIFO ordering
		this.#pipeline = parallelPipe(this.#pipeline, this.#concurrentLimit, async envelope => {
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

	#ensureProcessingStarted() {
		if (this.#processing)
			return;

		this.#processing = true;

		(async () => {
			for await (const { error, reject, data, resolve } of this.#pipeline) {
				try {
					if (error) {
						await this.revert(data);
						reject(error);
						continue;
					}

					const events: IEvent[] = [];
					for (const batch of data) {
						const { event, ...meta } = batch;
						if (!event)
							continue;
						if (isSnapshotEvent(event))
							continue;

						const p = this.#eventBus.publish(event, meta)
							.catch(this.#onError);

						this.#pending.add(p);
						p.finally(() => this.#pending.delete(p));

						events.push(event);
					}
					resolve(events);
				}
				catch (publishError: any) {
					reject(publishError);
				}
			}
		})();
	}

	/** Get a promise that resolves when all in-flight fire-and-forget event bus publishes have settled */
	async drain(): Promise<unknown> {
		return Promise.allSettled(this.#pending);
	}

	async revert(batch: DispatchPipelineBatch) {
		for (const processor of this.#processors)
			await processor.revert?.(batch);
	}

	push(envelope: EventBatchEnvelope) {
		this.#ensureProcessingStarted();
		this.#pipelineInput.push(envelope);
	}
}
