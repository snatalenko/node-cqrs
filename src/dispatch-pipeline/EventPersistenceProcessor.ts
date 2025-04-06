import { EventBatch, IContainer, IEvent, IEventProcessor, IEventStorageWriter } from '../interfaces';

/**
 * Processor responsible for persisting events to IEventStoreWriter.
 */
export class EventPersistenceProcessor implements IEventProcessor {

	#storageWriter: IEventStorageWriter | undefined;

	constructor(options: Pick<IContainer, 'eventStorageWriter'>) {
		this.#storageWriter = options.eventStorageWriter;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		if (!this.#storageWriter)
			return batch;

		const events: IEvent[] = [];
		for (const { event } of batch) {
			if (!event)
				throw new Error('Event batch does not contain event');

			events.push(event);
		}

		await this.#storageWriter.commitEvents(events);

		return batch;
	}
}
