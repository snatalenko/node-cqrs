import { DispatchPipelineBatch, IEvent, IDispatchPipelineProcessor } from './interfaces';
import { validate as defaultValidator } from './Event';

export type EventValidator = (event: IEvent) => void;

/**
 * Processor that validates the format of events.
 * Rejects the batch if any event fails validation.
 */
export class EventValidationProcessor implements IDispatchPipelineProcessor {

	#validate: EventValidator;

	constructor(o?: {
		eventFormatValidator?: EventValidator
	}) {
		this.#validate = o?.eventFormatValidator ?? defaultValidator;
	}

	/**
	 * Processes a batch of dispatch pipeline items by validating each event within the batch.
	 * It iterates through the batch and calls the private `#validate` method for each event found.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		for (const { event } of batch) {
			if (event)
				this.#validate(event);
		}
		return batch;
	}
}
