import { EventBatch, IEvent, IEventProcessor } from '../interfaces';
import { validate as defaultValidator } from '../Event';

export type EventValidator = (event: IEvent) => void;

/**
 * Processor that validates the format of events.
 * Rejects the batch if any event fails validation.
 */
export class EventValidationProcessor implements IEventProcessor {

	#validate: EventValidator;

	constructor(o?: {
		eventFormatValidator: EventValidator
	}) {
		this.#validate = o?.eventFormatValidator ?? defaultValidator;
	}

	async process(batch: EventBatch): Promise<EventBatch> {
		for (const { event } of batch) {
			if (event)
				this.#validate(event);
		}
		return batch;
	}
}
