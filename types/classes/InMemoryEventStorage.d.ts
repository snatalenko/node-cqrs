namespace NodeCqrs {

	/**
	 * A simple event storage implementation intended to use for tests only.
	 * Storage content resets on each app restart.
	 */
	declare class InMemoryEventStorage implements IEventStorage {

		constructor(): void;

		commitEvents(events: Array<IEvent>): Promise<void>;

		getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): void;

		getSagaEvents(sagaId: Identifier, options?: { beforeEvent?: IEvent }): void;

		getEvents(eventTypes: Array<string>): void;

		getNewId(): number;
	}
}
