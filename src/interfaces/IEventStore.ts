import { IEventDispatcher } from "./IEventDispatcher";
import { IEvent } from "./IEvent";
import { IEventStoreReader } from "./IEventStorage";
import { IIdentifierProvider } from "./IIdentifierProvider";
import { IMessageHandler, IObservable } from "./IObservable";

export interface IEventStore
	extends IObservable, IEventDispatcher, IEventStoreReader, IIdentifierProvider {

	registerSagaStarters(startsWith: string[] | undefined): void;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;
}
