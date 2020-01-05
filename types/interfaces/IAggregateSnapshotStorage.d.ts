declare interface IAggregateSnapshotStorage {
	getAggregateSnapshot(aggregateId: Identifier): Promise<IEvent>;
	saveAggregateSnapshot(IEvent): Promise<void>;
}
