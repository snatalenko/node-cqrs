import {
	type IEventDispatcher,
	type IDispatchPipelineProcessor,
	type IEventSet,
	type IEventBus,
	type IContainer,
	isEventSet
} from './interfaces/index.ts';
import { InMemoryMessageBus } from './in-memory/index.ts';
import { type EventBatchEnvelope, EventDispatchPipeline } from './EventDispatchPipeline.ts';

export class EventDispatcher implements IEventDispatcher {

	/** Default pipeline name */
	static DEFAULT_PIPELINE = 'default';

	/** Default maximum number of parallel batches for newly created pipelines */
	static DEFAULT_CONCURRENT_LIMIT = 100;

	/** Default router that uses `meta.origin` as the pipeline name */
	static DEFAULT_ROUTER = (_e: IEventSet, meta?: Record<string, any>) => meta?.origin;

	/**
	 * Event bus where dispatched messages are delivered after processing.
	 * If not provided in the constructor, defaults to an instance of `InMemoryMessageBus`.
	 */
	eventBus: IEventBus;

	/**
	 * Default maximum number of parallel batches for newly created pipelines.
	 */
	concurrentLimit: number;

	/** Router that selects a pipeline name given events and meta */
	eventDispatchRouter?: (events: IEventSet, meta?: Record<string, any>) => string | undefined;

	#pipelines = new Map<string, EventDispatchPipeline>();

	constructor(o?: Pick<IContainer, 'eventBus' | 'eventDispatchPipeline'> & {
		eventDispatcherConfig?: {
			concurrentLimit?: number
		},
		eventDispatchPipelines?: Record<string, IDispatchPipelineProcessor[]>,
		eventDispatchRouter?: (events: IEventSet, meta?: Record<string, any>) => string | undefined
	}) {
		this.eventBus = o?.eventBus ?? new InMemoryMessageBus();
		this.concurrentLimit = o?.eventDispatcherConfig?.concurrentLimit ?? EventDispatcher.DEFAULT_CONCURRENT_LIMIT;
		this.eventDispatchRouter = o?.eventDispatchRouter ?? EventDispatcher.DEFAULT_ROUTER;

		if (o?.eventDispatchPipelines) {
			// Initialize pipelines if provided
			for (const [name, processors] of Object.entries(o.eventDispatchPipelines))
				this.addPipeline(name, processors);
		}
		else if (o?.eventDispatchPipeline) {
			// Single pipeline provided becomes the default pipeline
			this.addPipeline(EventDispatcher.DEFAULT_PIPELINE, o.eventDispatchPipeline);
		}
		else {
			// Ensure default pipeline exists at minimum
			this.addPipeline(EventDispatcher.DEFAULT_PIPELINE, []);
		}
	}

	/** Add or create the default pipeline processors */
	addPipelineProcessors(eventDispatchPipeline: IDispatchPipelineProcessor[], pipelineName?: string) {
		if (!Array.isArray(eventDispatchPipeline))
			throw new TypeError('eventDispatchPipeline argument must be an Array');

		for (const processor of eventDispatchPipeline)
			this.addPipelineProcessor(processor, pipelineName);
	}

	/** Adds a single processor to the default pipeline */
	addPipelineProcessor(preprocessor: IDispatchPipelineProcessor, pipelineName?: string) {
		const pipeline = this.#pipelines.get(pipelineName ?? EventDispatcher.DEFAULT_PIPELINE);
		if (!pipeline)
			throw new Error(`Pipeline "${pipelineName ?? EventDispatcher.DEFAULT_PIPELINE}" does not exist`);

		pipeline.addProcessor(preprocessor);
	}

	/** Create a named pipeline with processors and optional concurrency limit */
	addPipeline(name: string, processors: IDispatchPipelineProcessor[] = [], options?: { concurrentLimit?: number }) {
		if (!name)
			throw new TypeError('pipeline name required');
		if (this.#pipelines.has(name))
			throw new Error(`pipeline "${name}" already exists`);

		const pipeline = new EventDispatchPipeline(this.eventBus, options?.concurrentLimit ?? this.concurrentLimit);
		for (const p of processors)
			pipeline.addProcessor(p);

		this.#pipelines.set(name, pipeline);

		return pipeline;
	}

	/** Dispatch events through a routed pipeline and publish to the shared eventBus */
	async dispatch(events: IEventSet, meta?: Record<string, any>) {
		if (!isEventSet(events) || events.length === 0)
			throw new TypeError('dispatch requires a non-empty array of events');

		let resolve!: (value: IEventSet | PromiseLike<IEventSet>) => void;
		let reject!: (reason?: any) => void;
		const promise = new Promise<IEventSet>((res, rej) => {
			resolve = res;
			reject = rej;
		});

		const envelope: EventBatchEnvelope = {
			data: events.map(event => ({ event, ...meta })),
			resolve,
			reject
		};

		const desired = this.eventDispatchRouter?.(events, meta) ?? EventDispatcher.DEFAULT_PIPELINE;
		const pipeline = this.#pipelines.get(desired) ?? this.#pipelines.get(EventDispatcher.DEFAULT_PIPELINE);
		if (!pipeline)
			throw new Error(`No "${desired}" pipeline configured`);

		pipeline.push(envelope);

		return promise;
	}
}
