import { IEventProcessor, IEventBus, EventBatch } from '../interfaces';

/**
 * Event dispatcher processor that publishes events to an external RabbitMQ event bus if provided.
 */
export class ExternalEventPublishingProcessor implements IEventProcessor {

	#externalEventBus?: IEventBus;

	constructor(options: { externalEventBus?: IEventBus }) {
		this.#externalEventBus = options.externalEventBus;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		if (!this.#externalEventBus)
			return batch;

		// TODO: ignore external events

		for (const { event } of batch) {
			if (!event)
				throw new Error('Event batch does not contain `event`');

			await this.#externalEventBus.publish(event);
		}

		return batch;
	}
}
