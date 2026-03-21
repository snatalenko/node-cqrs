import type { Identifier } from './Identifier.ts';
import type { ISnapshotEvent } from './ISnapshotEvent.ts';
import { isObject } from './isObject.ts';

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier):
		Promise<ISnapshotEvent<TState> | undefined> | ISnapshotEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: ISnapshotEvent<TState>): Promise<void> | void;

	deleteAggregateSnapshot<TState>(snapshotEvent: ISnapshotEvent<TState>): Promise<void> | void;
}

export const isAggregateSnapshotStorage = (obj: unknown): obj is IAggregateSnapshotStorage =>
	isObject(obj)
	&& 'getAggregateSnapshot' in obj
	&& typeof obj.getAggregateSnapshot === 'function'
	&& 'saveAggregateSnapshot' in obj
	&& typeof obj.saveAggregateSnapshot === 'function'
	&& 'deleteAggregateSnapshot' in obj
	&& typeof obj.deleteAggregateSnapshot === 'function';
