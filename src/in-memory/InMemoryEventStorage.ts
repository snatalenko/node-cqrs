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
	DispatchPipelineBatch,
	AggregateEventsQueryParams
} from '../interfaces/index.ts';
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

		const results = this.#events.filter(e =>
			e.sagaId === sagaId &&
			e.sagaVersion !== undefined &&
			beforeEvent.sagaVersion !== undefined &&
			e.sagaVersion < beforeEvent.sagaVersion);

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
