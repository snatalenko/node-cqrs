import {
	IIdentifierProvider,
	IEvent,
	IEventSet,
	EventQueryAfter,
	IEventStorageReader,
	IEventStream,
	IEventStorageWriter
} from "../interfaces";
import { nextCycle } from "./utils";

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 */
export class InMemoryEventStorage implements IEventStorageReader, IEventStorageWriter, IIdentifierProvider {
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

	async *getAggregateEvents(aggregateId, options?: { snapshot: IEvent }): IEventStream {
		await nextCycle();

		const afterVersion = options?.snapshot?.aggregateVersion;
		const results = !afterVersion ?
			this.#events.filter(e => e.aggregateId == aggregateId) :
			this.#events.filter(e =>
				e.aggregateId == aggregateId &&
				e.aggregateVersion !== undefined &&
				e.aggregateVersion > afterVersion);

		await nextCycle();

		yield* results;
	}

	async *getSagaEvents(sagaId, { beforeEvent }): IEventStream {
		await nextCycle();

		const results = this.#events.filter(e =>
			e.sagaId == sagaId &&
			e.sagaVersion !== undefined &&
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
}
