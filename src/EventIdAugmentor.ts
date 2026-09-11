import {
	type DispatchPipelineBatch,
	type DispatchPipelineEnvelope,
	type IContainer,
	type IDispatchPipelineProcessor,
	type IIdentifierProvider,
	isIdentifier
} from './interfaces/index.ts';
import { assertDefined } from './utils/assert.ts';

/**
 * Dispatch-pipeline processor that ensures each event has an `id`.
 *
 * Some components (e.g. `SagaEventHandler`) require `event.id` to correlate saga instances.
 * CqrsContainerBuilder includes this processor in its default pipeline.
 * For manual setup or replacement pipelines, put it before storage to assign missing ids.
 *
 * Identifiers assigned by the `identifierProvider` are kept as-is,
 * as well as identifiers already present on the events.
 */
export class EventIdAugmentor implements IDispatchPipelineProcessor {

	readonly #identifierProvider: IIdentifierProvider;

	constructor({ identifierProvider }: Pick<IContainer, 'identifierProvider'>) {
		assertDefined(identifierProvider, 'identifierProvider');

		this.#identifierProvider = identifierProvider;
	}

	async process(batch: DispatchPipelineBatch<DispatchPipelineEnvelope>) {
		for (const envelope of batch) {
			const event = envelope.event;
			if (!event)
				continue;
			if (isIdentifier(event.id))
				continue;

			event.id = await this.#identifierProvider.getNewId();
		}

		return batch;
	}
}
