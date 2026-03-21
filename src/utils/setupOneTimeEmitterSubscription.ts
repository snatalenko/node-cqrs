import type { IEvent, ILogger, IObservable } from '../interfaces/index.ts';
import { assertStringArray, assertFunction, assertObservable } from './assert.ts';

/**
 * Create one-time eventEmitter subscription for one or multiple events that match a filter
 *
 * @param {IObservable} emitter
 * @param {string[]} messageTypes Array of event type to subscribe to
 * @param {function(IEvent):any} [handler] Optional handler to execute for a first event received
 * @param {function(IEvent):boolean} [filter] Optional filter to apply before executing a handler
 * @param {ILogger} logger
 * @return {Promise<IEvent>} Resolves to first event that passes filter
 */
export function setupOneTimeEmitterSubscription(
	emitter: IObservable,
	messageTypes: string[],
	filter?: (e: IEvent) => boolean,
	handler?: (e: IEvent) => void,
	logger?: ILogger
): Promise<IEvent> {
	assertObservable(emitter, 'emitter');
	assertStringArray(messageTypes, 'messageTypes');
	if (handler)
		assertFunction(handler, 'handler');
	if (filter)
		assertFunction(filter, 'filter');

	return new Promise(resolve => {

		// handler will be invoked only once,
		// even if multiple events have been emitted before subscription was destroyed
		// https://nodejs.org/api/events.html#events_emitter_removelistener_eventname_listener
		let handled = false;

		function filteredHandler(event: IEvent) {
			if (filter && !filter(event))
				return;
			if (handled)
				return;
			handled = true;

			for (const messageType of messageTypes)
				emitter.off(messageType, filteredHandler);

			logger?.debug(`'${event.type}' received, one-time subscription to '${messageTypes.join(',')}' removed`);

			if (handler)
				handler(event);

			resolve(event);
		}

		for (const messageType of messageTypes)
			emitter.on(messageType, filteredHandler);

		logger?.debug(`set up one-time ${filter ? 'filtered subscription' : 'subscription'} to '${messageTypes.join(',')}'`);
	});
}
