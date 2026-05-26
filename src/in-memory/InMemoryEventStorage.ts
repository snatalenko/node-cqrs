import type { Tracer } from '@opentelemetry/api';
import type {
	IContainer,
	IIdentifierProvider,
	IEvent,
	IEventSet,
	EventQueryAfter,
	IEventStorageReader,
	IEventStream,
	Identifier,
	IDispatchPipelineProcessor,
	DispatchPipelineBatch,
	AggregateEventsQueryParams
} from '../interfaces/index.ts';
import { recordSpanError, spanContext } from '../telemetry/index.ts';
import { assertString, parseSagaId } from '../utils/index.ts';
import { nextCycle } from './utils/index.ts';
import { ConcurrencyError } from '../errors/index.ts';

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 */
export class InMemoryEventStorage implements
	IEventStorageReader,
	IIdentifierProvider,
	IDispatchPipelineProcessor {

	readonly #tracer: Tracer | undefined;
	#nextId: number = 0;
	#events: IEventSet = [];

	constructor({ tracerFactory }: Pick<IContainer, 'tracerFactory'> = {}) {
		this.#tracer = tracerFactory?.(new.target.name);
	}

	getNewId(): string {
		this.#nextId += 1;
		return String(this.#nextId);
	}

	async commitEvents(events: IEventSet, options?: { ignoreConcurrencyError?: boolean }): Promise<IEventSet> {
		await nextCycle();

		if (!options?.ignoreConcurrencyError) {
			for (const event of events) {
				if (event.aggregateId !== undefined && event.aggregateVersion !== undefined) {
					const conflict = this.#events.find(e =>
						e.aggregateId === event.aggregateId &&
						e.aggregateVersion === event.aggregateVersion);
					if (conflict)
						throw new ConcurrencyError(`Duplicate aggregateVersion ${event.aggregateVersion} for aggregate ${event.aggregateId}`);
				}
			}
		}

		this.#events = this.#events.concat(events);

		await nextCycle();

		return events;
	}

	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		await nextCycle();

		const afterVersion = options?.snapshot?.aggregateVersion;
		const allAfterSnapshot = !afterVersion ?
			this.#events.filter(e => e.aggregateId === aggregateId) :
			this.#events.filter(e =>
				e.aggregateId === aggregateId &&
				e.aggregateVersion !== undefined &&
				e.aggregateVersion > afterVersion);

		const results = options?.eventTypes === undefined ?
			allAfterSnapshot :
			allAfterSnapshot.filter(e => options.eventTypes!.includes(e.type));

		await nextCycle();

		yield* results;

		if (options?.tail === 'last' && allAfterSnapshot.length) {
			const tailEvent = allAfterSnapshot[allAfterSnapshot.length - 1];
			const alreadyYieldedTail = results.length && results[results.length - 1] === tailEvent;
			if (!alreadyYieldedTail)
				yield tailEvent;
		}
	}

	async* getSagaEvents(sagaId: Identifier, { beforeEvent }: { beforeEvent: IEvent }): IEventStream {
		await nextCycle();

		assertString(beforeEvent?.id, 'beforeEvent.id');

		const { sagaDescriptor, originEventId } = parseSagaId(sagaId);
		if (beforeEvent.sagaOrigins?.[sagaDescriptor] !== originEventId)
			throw new TypeError('beforeEvent.sagaOrigins does not match sagaId');

		const originOffset = this.#events.findIndex(e => e.id === originEventId);
		if (originOffset === -1)
			throw new Error(`origin event ${originEventId} not found`);

		const beforeEventOffset = this.#events.findIndex(e => e.id === beforeEvent.id);
		if (beforeEventOffset === -1)
			throw new Error(`beforeEvent ${beforeEvent.id} not found`);

		const results = this.#events
			.slice(originOffset, beforeEventOffset)
			.filter(e => e.sagaOrigins?.[sagaDescriptor] === originEventId);

		await nextCycle();

		yield* results;
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream {
		await nextCycle();

		const lastEventId = options?.afterEvent?.id;
		if (options?.afterEvent)
			assertString(options.afterEvent.id, 'options.afterEvent.id');

		let offsetFound = !lastEventId;
		for (const event of this.#events) {
			if (!offsetFound)
				offsetFound = event.id === lastEventId;
			else if (!eventTypes || eventTypes.includes(event.type))
				yield event;
		}
	}

	/**
	 * Processes a batch of dispatch pipeline items, extracts the events,
	 * commits them to the in-memory storage, and returns the original batch.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const otelSpan = this.#tracer?.startSpan('InMemoryEventStorage.process', undefined, spanContext(batch[0]));

		try {
			const events: IEvent[] = [];
			for (const { event } of batch) {
				if (!event)
					throw new Error('Event batch does not contain `event`');

				events.push(event);
			}

			if (batch.at(0)?.ignoreConcurrencyError)
				await this.commitEvents(events, { ignoreConcurrencyError: true });
			else
				await this.commitEvents(events);

			return batch;
		}
		catch (error: unknown) {
			recordSpanError(otelSpan, error);
			throw error;
		}
		finally {
			otelSpan?.end();
		}
	}
}
