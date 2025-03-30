import { EventBatch, IEvent, IEventProcessor, IEventStoreWriter } from '../interfaces';

/**
 * Processor responsible for persisting events using an in-memory event storage.
 * Typically used for testing or ephemeral scenarios where durability isn't required.
 */
export class EventPersistenceProcessor implements IEventProcessor {

	#storage: IEventStoreWriter;

	constructor(options: { storage: IEventStoreWriter }) {
		if (!options.storage)
			throw new TypeError('storage argument required');

		this.#storage = options.storage;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		if(!this.#storage)
			return batch;

		const events: IEvent[] = [];
		for(const { event } of batch) {
			if(!event)
				throw new Error('Event batch does not contain event');

			events.push(event);
		}

		await this.#storage.commitEvents(events);

		return batch;
	}
}
