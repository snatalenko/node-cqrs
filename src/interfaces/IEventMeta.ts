import type { IMessageMeta } from './IMessageMeta.ts';

/**
 * Metadata of a dispatched event, passed through dispatch pipelines and to event bus subscribers.
 * Custom dispatch metadata is passed along as additional properties.
 */
export interface IEventMeta extends IMessageMeta {

	/**
	 * Where the event was dispatched from: `EventStore.DEFAULT_ORIGIN` for events dispatched through the event store,
	 * the feed origin for events delivered by an event feed.
	 * Not carried over message brokers, so events received from a broker used as the event bus have no origin.
	 */
	origin?: string;

	[key: string]: any;
}
