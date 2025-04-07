import { Container } from 'di0';
import { ICommandBus } from './ICommandBus';
import { IEventDispatcher } from './IEventDispatcher';
import { IEventStore } from './IEventStore';
import { IEventBus } from './IEventBus';
import { IEventProcessor } from './IEventProcessor';
import { IEventStorageReader, IEventStorageWriter } from './IEventStorage';
import { IAggregateSnapshotStorage } from './IAggregateSnapshotStorage';
import { IIdentifierProvider } from './IIdentifierProvider';
import { IExtendableLogger, ILogger } from './ILogger';

export interface IContainer extends Container {
	eventBus: IEventBus;
	eventStore: IEventStore
	eventStorageReader: IEventStorageReader;
	eventStorageWriter?: IEventStorageWriter;
	identifierProvider?: IIdentifierProvider;
	snapshotStorage?: IAggregateSnapshotStorage;

	commandBus: ICommandBus;
	eventDispatcher: IEventDispatcher;
	eventDispatchProcessors?: IEventProcessor[];

	logger?: ILogger | IExtendableLogger;

	// eslint-disable-next-line no-undef
	process?: NodeJS.Process
}
