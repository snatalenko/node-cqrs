import { IEvent, ILogger, IObservable } from '../interfaces';

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
	if (typeof emitter !== 'object' || !emitter)
		throw new TypeError('emitter argument must be an Object');
	if (!Array.isArray(messageTypes) || messageTypes.some(m => !m || typeof m !== 'string'))
		throw new TypeError('messageTypes argument must be an Array of non-empty Strings');
	if (handler && typeof handler !== 'function')
		throw new TypeError('handler argument, when specified, must be a Function');
	if (filter && typeof filter !== 'function')
		throw new TypeError('filter argument, when specified, must be a Function');

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
