import {
	DispatchPipelineBatch,
	IEvent,
	IDispatchPipelineProcessor,
	IEventBus,
	isDispatchPipelineProcessor
} from './interfaces';

import { parallelPipe } from 'async-parallel-pipe';
import { AsyncIterableBuffer } from 'async-iterable-buffer';
import { getClassName } from './utils';

export type EventBatchEnvelope = {
	data: DispatchPipelineBatch<{ event?: IEvent }>;
	error?: Error;
	resolve: (event: IEvent[]) => void;
	reject: (error: Error) => void;
};

export class EventDispatchPipeline {

	#pipelineInput = new AsyncIterableBuffer<EventBatchEnvelope>();
	#processors: Array<IDispatchPipelineProcessor> = [];
	#pipeline: AsyncIterableIterator<EventBatchEnvelope> | IterableIterator<EventBatchEnvelope> = this.#pipelineInput;
	#processing = false;

	constructor(private readonly eventBus: IEventBus, private readonly concurrentLimit: number) {
	}

	addProcessor(preprocessor: IDispatchPipelineProcessor) {
		if (!isDispatchPipelineProcessor(preprocessor))
			throw new TypeError(`preprocessor ${getClassName(preprocessor)} does not implement IDispatchPipelineProcessor`);
		if (this.#processing)
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
						const { event, ...meta } = batch as any;
						if (event) {
							await this.eventBus.publish(event, meta);
							events.push(event);
						}
					}
					resolve(events);
				}
				catch (publishError: any) {
					reject(publishError);
				}
			}
		})();
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
