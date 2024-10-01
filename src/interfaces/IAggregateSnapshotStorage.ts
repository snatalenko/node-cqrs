import { IEvent } from "./IEvent";

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: string): Promise<IEvent<TState> | undefined> | IEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;
}
