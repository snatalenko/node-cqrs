import { Container } from 'di0';
import type { ICommandBus } from './ICommandBus.ts';
import type { IEventDispatcher } from './IEventDispatcher.ts';
import type { IEventStore } from './IEventStore.ts';
import type { IEventBus } from './IEventBus.ts';
import type { IDispatchPipelineProcessor } from './IDispatchPipelineProcessor.ts';
import type { IEventStorageReader } from './IEventStorageReader.ts';
import type { IAggregateSnapshotStorage } from './IAggregateSnapshotStorage.ts';
import type { IIdentifierProvider } from './IIdentifierProvider.ts';
import type { IExtendableLogger, ILogger } from './ILogger.ts';
import type { ILocker } from './ILocker.ts';

export interface IContainer extends Container {
	eventBus: IEventBus;
	eventStore: IEventStore
	eventStorageReader: IEventStorageReader;
	eventStorage?: IEventStorageReader;
	identifierProvider?: IIdentifierProvider;
	snapshotStorage?: IAggregateSnapshotStorage;
	eventIdAugmenter?: IDispatchPipelineProcessor;

	commandBus: ICommandBus;
	eventDispatcher?: IEventDispatcher;

	/** Default event dispatch pipeline */
	eventDispatchPipeline?: IDispatchPipelineProcessor[];

	/** Multiple event dispatch pipelines per origin */
	eventDispatchPipelines?: Record<string, IDispatchPipelineProcessor[]>;

	executionLocker?: ILocker;

	logger?: ILogger | IExtendableLogger;

	process?: NodeJS.Process
}
