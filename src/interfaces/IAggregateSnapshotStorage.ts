import type { Identifier } from './Identifier.ts';
import type { IEvent } from './IEvent.ts';

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier):
		Promise<IEvent<TState> | undefined> | IEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;

	deleteAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;
}
