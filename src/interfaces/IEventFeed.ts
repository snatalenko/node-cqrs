import { isObject } from './isObject.ts';

/** Default origin of events delivered by event feeds */
export const DEFAULT_EVENT_FEED_ORIGIN = 'external';

/** Constructor parameters injected into event feeds by `registerEventFeed()`, next to container dependencies */
export type EventFeedParams = {

	/** Origin of the events dispatched by the event feed, injected by `registerEventFeed()` */
	eventFeedOrigin?: string
};

/**
 * Source of events committed by other nodes, such as an event storage watching for new commits
 * or a message broker subscription.
 *
 * Feeds receive the origin of the events they deliver as an `eventFeedOrigin` constructor parameter, declared by
 * each feed next to its container dependencies and injected by `registerEventFeed()`. They dispatch events through
 * the container's `eventDispatcher`, resolved lazily with the injected `get()`, since a feed can also be a processor
 * of the dispatcher pipelines.
 */
export interface IEventFeed {

	/** Starts dispatching events committed by other nodes */
	startEventFeed(): Promise<void> | void;

	/** Stops dispatching events and releases resources */
	stopEventFeed(): Promise<void> | void;
}

export const isEventFeed = (obj: unknown): obj is IEventFeed =>
	isObject(obj)
	&& typeof obj.startEventFeed === 'function'
	&& typeof obj.stopEventFeed === 'function';
