import { InMemoryMessageBus } from './in-memory/index.ts';

/** @deprecated Use {@link InMemoryMessageBus} directly or a transport-specific implementation. */
export class CommandBus extends InMemoryMessageBus { }
