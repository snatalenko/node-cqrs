import { Identifier } from './Identifier';
import { IEvent } from './IEvent';

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier):
		Promise<IEvent<TState> | undefined> | IEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;

	deleteAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;
}
