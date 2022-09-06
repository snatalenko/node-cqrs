import { IEvent, IEventStorage, IEventSet, IEventStream } from "../interfaces";

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
		this.#events = this.#events.concat(events);
		return events;
	}

	async getAggregateEvents(aggregateId, options?: { snapshot: IEvent }): Promise<IEventSet> {
		const afterVersion = options?.snapshot?.aggregateVersion;
		if (afterVersion) {
			return this.#events.filter(e =>
				e.aggregateId == aggregateId &&
				e.aggregateVersion !== undefined &&
				e.aggregateVersion > afterVersion);
		}

		return this.#events.filter(e => e.aggregateId == aggregateId);
	}

	async getSagaEvents(sagaId, { beforeEvent }): Promise<IEventSet> {
		return this.#events.filter(e =>
			e.sagaId == sagaId &&
			e.sagaVersion !== undefined &&
			e.sagaVersion < beforeEvent.sagaVersion);
	}

	async* getEvents(eventTypes): IEventStream {
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
