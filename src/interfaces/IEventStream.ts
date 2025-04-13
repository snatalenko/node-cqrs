import { IEvent } from './IEvent';

export type IEventStream = AsyncIterableIterator<Readonly<IEvent>>;
