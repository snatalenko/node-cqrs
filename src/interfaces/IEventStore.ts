import type { IEventDispatcher } from './IEventDispatcher.ts';
import type { IEvent } from './IEvent.ts';
import type { IEventStorageReader } from './IEventStorageReader.ts';
import type { IIdentifierProvider } from './IIdentifierProvider.ts';
import type { IMessageHandler, IObservable } from './IObservable.ts';
import type { IObservableQueueProvider } from './IObservableQueueProvider.ts';

export interface IEventStore
	extends IObservable, IObservableQueueProvider, IEventDispatcher, IEventStorageReader, IIdentifierProvider {

	registerSagaStarters(startsWith: string[] | undefined): void;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;
}
