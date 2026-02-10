import type {
	DispatchPipelineBatch,
	DispatchPipelineEnvelope,
	IContainer,
	IDispatchPipelineProcessor,
	IIdentifierProvider
} from './interfaces/index.ts';

/**
 * Dispatch-pipeline processor that ensures each event has an `id`.
 *
 * Some components (e.g. `SagaEventHandler`) require `event.id` to correlate saga instances.
 * Put this processor early in the `eventDispatchPipeline` to auto-assign ids to events that don't have them.
 */
export class EventIdAugmentor implements IDispatchPipelineProcessor {

	#identifierProvider: IIdentifierProvider;

	constructor({ identifierProvider }: Pick<IContainer, 'identifierProvider'>) {
		if (!identifierProvider)
			throw new TypeError('identifierProvider argument required');

		this.#identifierProvider = identifierProvider;
	}

	async process(batch: DispatchPipelineBatch<DispatchPipelineEnvelope>) {
		for (const envelope of batch) {
			const event = envelope.event;
			if (!event)
				continue;
			if (typeof event.id === 'string' && event.id.length)
				continue;

			event.id = String(await this.#identifierProvider.getNewId());
		}

		return batch;
	}
}
