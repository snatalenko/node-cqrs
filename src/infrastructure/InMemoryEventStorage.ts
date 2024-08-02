import { IEvent, IEventStorage, IEventSet, IEventStream } from "../interfaces";
import { nextCycle } from "./utils";

/**
 * A simple event storage implementation intended to use for tests only.
 * Storage content resets on each app restart.
 *
 * @class InMemoryEventStorage
 * @implements {IEventStorage}
 */
export class InMemoryEventStorage implements IEventStorage {

	#nextId: number = 0;
	#events: IEventSet = [];

	async commitEvents(events: IEventSet): Promise<IEventSet> {
		await nextCycle();

		this.#events = this.#events.concat(events);

		await nextCycle();

		return events;
	}

	async getAggregateEvents(aggregateId, options?: { snapshot: IEvent }): Promise<IEventSet> {
		await nextCycle();

		const afterVersion = options?.snapshot?.aggregateVersion;
		const result = !afterVersion ?
			this.#events.filter(e => e.aggregateId == aggregateId) :
			this.#events.filter(e =>
				e.aggregateId == aggregateId &&
				e.aggregateVersion !== undefined &&
				e.aggregateVersion > afterVersion);

		await nextCycle();

		return result;
	}

	async getSagaEvents(sagaId, { beforeEvent }): Promise<IEventSet> {
		await nextCycle();

		const results = this.#events.filter(e =>
			e.sagaId == sagaId &&
			e.sagaVersion !== undefined &&
			e.sagaVersion < beforeEvent.sagaVersion);

		await nextCycle();

		return results;
	}

	async* getEvents(eventTypes): IEventStream {
		await nextCycle();

		for await (const event of this.#events) {
			if (!eventTypes || eventTypes.includes(event.type))
				yield event;
		}
	}

	getNewId(): number {
		this.#nextId += 1;
		return this.#nextId;
	}
}
