import {
	DispatchPipelineBatch,
	IAggregateSnapshotStorage,
	IContainer,
	Identifier,
	IDispatchPipelineProcessor,
	IEvent,
	ILogger
} from '../interfaces';
import * as Event from '../Event';

const SNAPSHOT_EVENT_TYPE = 'snapshot';
const isSnapshotEvent = (event?: IEvent): event is IEvent & { type: 'snapshot' } =>
	(!!event && event.type === SNAPSHOT_EVENT_TYPE);

/**
 * In-memory storage for aggregate snapshots.
 * Storage content resets on app restart
 */
export class InMemorySnapshotStorage implements IAggregateSnapshotStorage, IDispatchPipelineProcessor {

	#snapshots: Map<Identifier, IEvent> = new Map();
	#logger: ILogger | undefined;

	constructor(c?: Partial<Pick<IContainer, 'logger'>>) {
		this.#logger = c?.logger && 'child' in c?.logger ?
			c?.logger.child({ service: new.target.name }) :
			c?.logger;
	}

	/**
	 * Get latest aggregate snapshot
	 */
	async getAggregateSnapshot(aggregateId: string): Promise<IEvent | undefined> {
		return this.#snapshots.get(aggregateId);
	}

	/**
	 * Save new aggregate snapshot
	 */
	async saveAggregateSnapshot(snapshotEvent: IEvent) {
		if (!snapshotEvent.aggregateId)
			throw new TypeError('event.aggregateId is required');

		this.#logger?.debug(`Persisting ${Event.describe(snapshotEvent)}`);

		this.#snapshots.set(snapshotEvent.aggregateId, snapshotEvent);
	}

	/**
	 * Delete aggregate snapshot
	 */
	deleteAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void {
		if (!snapshotEvent.aggregateId)
			throw new TypeError('snapshotEvent.aggregateId argument required');

		this.#logger?.debug(`Removing ${Event.describe(snapshotEvent)}`);

		this.#snapshots.delete(snapshotEvent.aggregateId);
	}

	/**
	 * Processes a batch of events, saves any snapshot events found, and returns the batch
	 * without the snapshot events.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const snapshotEvents = batch.map(e => e.event).filter(isSnapshotEvent);
		for (const event of snapshotEvents)
			await this.saveAggregateSnapshot(event);

		return batch.filter(e => !isSnapshotEvent(e.event));
	}

	/**
	 * Reverts the snapshots associated with the events in the given batch.
	 * It filters the batch for snapshot events and deletes the corresponding aggregate snapshots.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 *
	 * @param batch The batch of events to revert snapshots for.
	 */
	async revert(batch: DispatchPipelineBatch): Promise<void> {
		const snapshotEvents = batch.map(e => e.event).filter(isSnapshotEvent);
		for (const snapshotEvent of snapshotEvents)
			await this.deleteAggregateSnapshot(snapshotEvent);
	}
}
