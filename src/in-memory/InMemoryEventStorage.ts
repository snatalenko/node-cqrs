import type {
	IIdentifierProvider,
	IEvent,
	IEventSet,
	EventQueryAfter,
	IEventStorageReader,
	IEventStream,
	IEventStorageWriter,
	Identifier,
	IDispatchPipelineProcessor,
	DispatchPipelineBatch
} from '../interfaces/index.ts';
import { parseSagaId } from '../utils/index.ts';
import { nextCycle } from './utils/index.ts';

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 */
export class InMemoryEventStorage implements
	IEventStorageReader,
	IEventStorageWriter,
	IIdentifierProvider,
	IDispatchPipelineProcessor {

	#nextId: number = 0;
	#events: IEventSet = [];

	getNewId(): string {
		this.#nextId += 1;
		return String(this.#nextId);
	}

	async commitEvents(events: IEventSet): Promise<IEventSet> {
		await nextCycle();

		this.#events = this.#events.concat(events);

		await nextCycle();

		return events;
	}

	async* getAggregateEvents(aggregateId: Identifier, options?: { snapshot: IEvent }): IEventStream {
		await nextCycle();

		const afterVersion = options?.snapshot?.aggregateVersion;
		const results = !afterVersion ?
			this.#events.filter(e => e.aggregateId === aggregateId) :
			this.#events.filter(e =>
				e.aggregateId === aggregateId &&
				e.aggregateVersion !== undefined &&
				e.aggregateVersion > afterVersion);

		await nextCycle();

		yield* results;
	}

	async* getSagaEvents(sagaId: Identifier, { beforeEvent }: { beforeEvent: IEvent }): IEventStream {
		await nextCycle();

		if (typeof beforeEvent?.id !== 'string' || !beforeEvent.id.length)
			throw new TypeError('beforeEvent.id is required');

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
		if (options?.afterEvent && !lastEventId)
			throw new TypeError('options.afterEvent.id is required');

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
		const events: IEvent[] = [];
		for (const { event } of batch) {
			if (!event)
				throw new Error('Event batch does not contain `event`');

			events.push(event);
		}

		await this.commitEvents(events);

		return batch;
	}
}
