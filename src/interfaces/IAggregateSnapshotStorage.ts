import type { Identifier } from './Identifier.ts';
import type { ISnapshotEvent } from './ISnapshotEvent.ts';

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier):
		Promise<ISnapshotEvent<TState> | undefined> | ISnapshotEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: ISnapshotEvent<TState>): Promise<void> | void;

	deleteAggregateSnapshot<TState>(snapshotEvent: ISnapshotEvent<TState>): Promise<void> | void;
}
