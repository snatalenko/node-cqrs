import { Container } from 'di0';
import { ICommandBus } from './ICommandBus';
import { IEventDispatcher } from './IEventDispatcher';
import { IEventStore } from './IEventStore';
import { IEventBus } from './IEventBus';
import { IDispatchPipelineProcessor } from './IDispatchPipelineProcessor';
import { IEventStorageReader } from './IEventStorage';
import { IAggregateSnapshotStorage } from './IAggregateSnapshotStorage';
import { IIdentifierProvider } from './IIdentifierProvider';
import { IExtendableLogger, ILogger } from './ILogger';

export interface IContainer extends Container {
	eventBus: IEventBus;
	eventStore: IEventStore
	eventStorageReader: IEventStorageReader;
	identifierProvider?: IIdentifierProvider;
	snapshotStorage?: IAggregateSnapshotStorage;

	commandBus: ICommandBus;
	eventDispatcher: IEventDispatcher;
	eventDispatchPipeline?: IDispatchPipelineProcessor[];

	logger?: ILogger | IExtendableLogger;

	process?: NodeJS.Process
}
