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
const isSnapshotEvent = (event?: IEvent): event is IEvent & { type: 'snapshot' } =>
	(!!event && event.type === SNAPSHOT_EVENT_TYPE);

export class SnapshotPersistenceProcessor implements IEventProcessor<{ event?: IEvent }> {

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

	async process(batch: EventBatch): Promise<EventBatch> {
		if (!this.#snapshotStorage)
			return batch;

		const snapshotEvents = batch.map(e => e.event).filter(isSnapshotEvent);
		for (const event of snapshotEvents) {
			this.#logger?.debug(`Persisting ${Event.describe(event)}`);
			await this.#snapshotStorage.saveAggregateSnapshot(event);
		}

		return batch.filter(e => !isSnapshotEvent(e.event));
	}

	async revert(batch: EventBatch): Promise<void> {
		if (!this.#snapshotStorage)
			return;

		const snapshotEvents = batch.map(e => e.event).filter(isSnapshotEvent);
		for (const snapshotEvent of snapshotEvents) {
			this.#logger?.debug(`Removing ${Event.describe(snapshotEvent)}`);
			await this.#snapshotStorage.deleteAggregateSnapshot(snapshotEvent);
		}
	}
}
