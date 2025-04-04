import { EventBatch, IEvent, IEventProcessor, IEventStorageWriter } from '../interfaces';

/**
 * Processor responsible for persisting events to IEventStoreWriter.
 */
export class EventPersistenceProcessor implements IEventProcessor {

	#storage: IEventStorageWriter;

	constructor(options: { storage: IEventStorageWriter }) {
		if (!options.storage)
			throw new TypeError('storage argument required');

		this.#storage = options.storage;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		if (!this.#storage)
			return batch;

		const events: IEvent[] = [];
		for (const { event } of batch) {
			if (!event)
				throw new Error('Event batch does not contain event');

			events.push(event);
		}

		await this.#storage.commitEvents(events);

		return batch;
	}
}
