import type { IEvent } from './IEvent.ts';

export type IEventStream = AsyncIterableIterator<Readonly<IEvent>>;
