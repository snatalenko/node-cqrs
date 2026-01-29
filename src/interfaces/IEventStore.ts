import type { IEventDispatcher } from './IEventDispatcher';
import type { IEvent } from './IEvent';
import type { IEventStorageReader } from './IEventStorageReader';
import type { IIdentifierProvider } from './IIdentifierProvider';
import type { IMessageHandler, IObservable } from './IObservable';
import type { IObservableQueueProvider } from './IObservableQueueProvider';

export interface IEventStore
	extends IObservable, IObservableQueueProvider, IEventDispatcher, IEventStorageReader, IIdentifierProvider {

	registerSagaStarters(startsWith: string[] | undefined): void;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;
}
