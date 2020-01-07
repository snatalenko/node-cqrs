namespace NodeCqrs {

	/**
	 * In-memory storage for aggregate snapshots.
	 * Storage content resets on app restart
	 */
	declare class InMemorySnapshotStorage implements IAggregateSnapshotStorage {

		/** Creates an instance of InMemorySnapshotStorage */
		constructor(): void;

		/** Get latest aggregate snapshot */
		getAggregateSnapshot(aggregateId: Identifier): Promise<IEvent>;

		/** Save new aggregate snapshot */
		saveAggregateSnapshot(snapshotEvent: IEvent): void;
	}
}
