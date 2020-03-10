declare interface IAggregateSnapshotStorage {
	getAggregateSnapshot(aggregateId: Identifier): Promise<IEvent>;
	saveAggregateSnapshot(IEvent): Promise<void>;
}

declare type TSnapshot<TPayload = object> = {
	/** 
	 * Schema version of the data stored in `state` property.
	 * Snapshots with older schema versions must be passed thru a data migration before applying for a newer schema
	 */
	schemaVersion: string | number;

	/**
	 * Last event that was processed before making a snapshot
	 */
	lastEvent: IEvent;

	/**
	 * Snapshot data
	 */
	data: TPayload;
}

declare interface ISnapshotStorage {
	getSnapshot(id: Identifier): Promise<TSnapshot>;
	saveSnapshot(id: Identifier, snapshot: TSnapshot): Promise<void>;
}

declare type ISnapshotEvent<TPayload> = IEvent<TSnapshot<TPayload>>;
