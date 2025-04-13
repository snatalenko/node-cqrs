import { IEventDispatcher } from './IEventDispatcher';
import { IEvent } from './IEvent';
import { IEventStorageReader } from './IEventStorage';
import { IIdentifierProvider } from './IIdentifierProvider';
import { IMessageHandler, IObservable } from './IObservable';

export interface IEventStore
	extends IObservable, IEventDispatcher, IEventStorageReader, IIdentifierProvider {

	registerSagaStarters(startsWith: string[] | undefined): void;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;
}
