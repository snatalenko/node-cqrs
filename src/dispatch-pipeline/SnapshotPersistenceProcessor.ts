import {
	EventBatch,
	IAggregateSnapshotStorage,
	IEvent,
	IEventProcessor,
	IExtendableLogger,
	ILogger
} from "../interfaces";
import * as Event from '../Event';

const SNAPSHOT_EVENT_TYPE = 'snapshot';

export class SnapshotPersistenceProcessor implements IEventProcessor {

	#snapshotStorage?: IAggregateSnapshotStorage;
	#logger?: ILogger;

	constructor(options: {
		snapshotStorage?: IAggregateSnapshotStorage;
		logger?: ILogger | IExtendableLogger;
	}) {
		this.#snapshotStorage = options.snapshotStorage;
		this.#logger = options.logger && 'child' in options.logger ?
			options.logger.child({ service: new.target.name }) :
			options.logger;
	}

	#extractSnapshotEvent(batch: EventBatch): IEvent | undefined {
		if (!Array.isArray(batch))
			throw new TypeError('batch argument must be an Array');

		const snapshotEvents = batch.filter(({ event }) => event?.type === SNAPSHOT_EVENT_TYPE);
		if (snapshotEvents.length > 1)
			throw new Error(`Cannot process more than one "${SNAPSHOT_EVENT_TYPE}" event per batch`);

		return snapshotEvents[0].event;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		if (!this.#snapshotStorage)
			return batch;

		const snapshotEvent = this.#extractSnapshotEvent(batch);
		if (!snapshotEvent)
			return batch;

		this.#logger?.debug(`Persisting ${Event.describe(snapshotEvent)}`);

		await this.#snapshotStorage.saveAggregateSnapshot(snapshotEvent);

		return batch.filter(e => e !== snapshotEvent);
	}

	async revert(batch: EventBatch): Promise<void> {
		if (!this.#snapshotStorage)
			return;

		const snapshotEvent = this.#extractSnapshotEvent(batch);
		if (!snapshotEvent)
			return;

		this.#logger?.debug(`Removing ${Event.describe(snapshotEvent)}`);

		await this.#snapshotStorage?.deleteAggregateSnapshot(snapshotEvent);
	}
}
