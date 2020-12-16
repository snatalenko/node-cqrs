'use strict';

import { Identifier, IEvent, IEventQueryFilter, IEventStorage, IEventStream, ILogger, IMessageBus, IMessageHandler, IObservable } from "./interfaces";
import { setupOneTimeEmitterSubscription } from "./utils";

const formatEventType = (events: IEventStream): string =>
	(events.length === 1 ? `'${events[0].type}'` : `${events.length} events`);

const isIEventStorage = (storage: IEventStorage) => storage
	&& typeof storage.getNewId === 'function'
	&& typeof storage.commit === 'function'
	&& typeof storage.getStream === 'function'
	&& typeof storage.getEventsByTypes === 'function';

const isIObservable = (obj: IObservable | any) => obj
	&& typeof obj.on === 'function'
	&& typeof obj.off === 'function';

const isIMessageBus = (bus: IMessageBus | any): boolean => bus
	&& isIObservable(bus)
	&& typeof bus.send === 'function'
	&& typeof bus.publish === 'function';

/**
 * Validate event structure
 */
function defaultValidator(event: IEvent) {
	/* istanbul ignore if */
	if (typeof event !== 'object' || !event)
		throw new TypeError('event must be an Object');
	/* istanbul ignore if */
	if (typeof event.type !== 'string' || !event.type.length)
		throw new TypeError('event.type must be a non-empty String');
	/* istanbul ignore if */
	if (!event.aggregateId && !event.sagaId)
		throw new TypeError('either event.aggregateId or event.sagaId is required');
	/* istanbul ignore if */
	if (event.sagaId && typeof event.sagaVersion === 'undefined')
		throw new TypeError('event.sagaVersion is required, when event.sagaId is defined');
}

/**
 * Facade that combines functionality of IEventStorage and IObservable into single IEventStore interface.
 *
 * If storage instance implements the IObservable interface, it can be used directly without this facade.
 */
export default class EventStore implements IObservable, IEventStorage {

	#config: { publishAsync: boolean };
	#validator: (event: IEvent<any>) => void;
	#logger?: ILogger;
	#storage: IEventStorage;
	#messageBus: IMessageBus;

	/**
	 * Creates an instance of EventStore.
	 */
	constructor({
		storage,
		messageBus,
		eventValidator = defaultValidator,
		eventStoreConfig,
		logger
	}: {
		storage: IEventStorage,
		messageBus: IMessageBus,
		eventValidator?: IMessageHandler,
		eventStoreConfig?: {
			publishAsync?: boolean
		},
		logger: ILogger
	}) {
		if (!isIEventStorage(storage))
			throw new TypeError('storage does not implement IEventStorage interface');
		if (isIObservable(storage))
			throw new TypeError('storage already implements IObservable interface and can be used without EventStore wrapper');
		if (!isIMessageBus(messageBus))
			throw new TypeError('messageBus does not implement IMessageBus interface');

		this.#config = { publishAsync: true, ...eventStoreConfig };
		this.#validator = eventValidator;
		this.#logger = logger;
		this.#storage = storage;
		this.#messageBus = messageBus;
	}

	/**
	 * Retrieve new ID from the storage
	 */
	async getNewId(): Promise<Identifier> {
		return this.#storage.getNewId();
	}

	/**
	 * Save and publish a set of events
	 */
	async commit(streamId: Identifier, events: IEventStream): Promise<IEventStream> {
		events.forEach(this.#validator);

		const newEvents = await this.#storage.commit(streamId, events);

		if (this.#config.publishAsync)
			setImmediate(() => this._publishEvents(newEvents));
		else
			await this._publishEvents(newEvents);

		return newEvents;
	}

	private async _publishEvents(events: IEventStream) {
		try {
			await Promise.all(events.map(event =>
				this.#messageBus.publish(event)));

			this._log(`${formatEventType(events)} published`);
		}
		catch (error) {
			this.#logger?.log('error', `${formatEventType(events)} publishing failed: ${error.message}`, { service: 'EventStore', stack: error.stack });

			throw error;
		}
	}

	/**
	 * Get a stream of events by identifier
	 */
	getStream(streamId: Identifier, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent> {
		this._log(`Retrieving stream ${streamId}`);
		return this.#storage.getStream(streamId, filter);
	}

	/**
	 * Get events by their types
	 */
	getEventsByTypes(eventTypes: string[], filter?: IEventQueryFilter): AsyncIterableIterator<IEvent> {
		this._log(`Retrieving events ${eventTypes.join(', ')}`);
		return this.#storage.getEventsByTypes(eventTypes, filter);
	}

	/**
	 * Setup listener for specific event type
	 */
	on(messageType: string, handler: IMessageHandler) {
		this.#messageBus.on(messageType, handler);
	}

	/**
	 * Remove previously installed listener
	 */
	off(messageType: string, handler: IMessageHandler) {
		this.#messageBus.off(messageType, handler);
	}

	/**
	 * Get or create a named queue, which delivers events to a single handler only
	 */
	queue(name: string): IObservable {
		if (typeof this.#messageBus.queue !== 'function')
			throw new Error('Named queues are not supported by the underlying messageBus');

		return this.#messageBus.queue(name);
	}

	/**
	 * Creates one-time subscription for one or multiple events that match a filter
	 */
	once(messageTypes: string | string[], handler: IMessageHandler, filter: (e: IEvent) => boolean): Promise<IEvent> {
		const subscribeTo = Array.isArray(messageTypes) ? messageTypes : [messageTypes];

		return setupOneTimeEmitterSubscription(this.#messageBus, subscribeTo, filter, handler, this.#logger);
	}

	private _log(message: string) {
		this.#logger?.log('debug', message, { service: 'EventStore' });
	}
}
