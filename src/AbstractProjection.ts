import { describe } from './Event';
import { InMemoryView } from './in-memory/InMemoryView';
import {
	IViewLocker,
	IEventLocker,
	IProjection,
	ILogger,
	IExtendableLogger,
	IEventStore,
	IEvent,
	isViewLocker,
	isEventLocker
} from './interfaces';

import {
	getClassName,
	validateHandlers,
	getHandler,
	subscribe,
	getMessageHandlerNames
} from './utils';

export type AbstractProjectionParams<T> = {
	/**
	 * The default view associated with the projection.
	 * Can optionally implement IViewLocker and/or IEventLocker.
	 */
	view?: T,

	/**
	 * Manages view restoration state to prevent early access to an inconsistent view
	 * or conflicts from concurrent restoration by other processes.
	 */
	viewLocker?: IViewLocker,

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes.
	 */
	eventLocker?: IEventLocker,

	logger?: ILogger | IExtendableLogger
}

/**
 * Base class for Projection definition
 */
export abstract class AbstractProjection<TView = any> implements IProjection<TView> {

	/**
	 * List of event types handled by the projection. Can be overridden in the projection implementation.
	 * If not overridden, event types will be inferred from handler methods defined on the Projection class.
	 */
	static get handles(): string[] {
		return getMessageHandlerNames(this);
	}

	#view?: TView;
	#viewLocker?: IViewLocker;
	#eventLocker?: IEventLocker;
	protected _logger?: ILogger;

	/**
	 * The default view associated with the projection.
	 * Can optionally implement IViewLocker and/or IEventLocker.
	 */
	public get view(): TView {
		return this.#view ?? (this.#view = new InMemoryView() as TView);
	}

	protected set view(value: TView) {
		this.#view = value;
	}

	/**
	 * Manages view restoration state to prevent early access to an inconsistent view
	 * or conflicts from concurrent restoration by other processes.
	 */
	protected get _viewLocker(): IViewLocker | undefined {
		return this.#viewLocker ?? (isViewLocker(this.view) ? this.view : undefined);
	}

	protected set _viewLocker(value: IViewLocker | undefined) {
		this.#viewLocker = value;
	}

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes.
	 */
	protected get _eventLocker(): IEventLocker | undefined {
		return this.#eventLocker ?? (isEventLocker(this.view) ? this.view : undefined);
	}

	protected set _eventLocker(value: IEventLocker | undefined) {
		this.#eventLocker = value;
	}

	constructor({
		view,
		viewLocker,
		eventLocker,
		logger
	}: AbstractProjectionParams<TView> = {}) {
		validateHandlers(this);

		this.#view = view;
		this.#viewLocker = viewLocker;
		this.#eventLocker = eventLocker;

		this._logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
	}

	/** Subscribe to event store */
	async subscribe(eventStore: IEventStore): Promise<void> {
		subscribe(eventStore, this, {
			masterHandler: (e: IEvent) => this.project(e)
		});

		await this.restore(eventStore);
	}

	/** Pass event to projection event handler */
	async project(event: IEvent): Promise<void> {
		if (this._viewLocker && !this._viewLocker?.ready) {
			this._logger?.debug('view is locked, awaiting until it is ready');
			await this._viewLocker.once('ready');
		}

		return this._project(event);
	}

	/** Pass event to projection event handler, without awaiting for restore operation to complete */
	protected async _project(event: IEvent): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		if (this._eventLocker) {
			const eventLockObtained = await this._eventLocker.tryMarkAsProjecting(event);
			if (!eventLockObtained)
				return;
		}

		await handler.call(this, event);

		if (this._eventLocker)
			await this._eventLocker.markAsProjected(event);
	}

	/** Restore projection view from event store */
	async restore(eventStore: IEventStore): Promise<void> {
		// lock the view to ensure same restoring procedure
		// won't be performed by another projection instance
		if (this._viewLocker)
			await this._viewLocker.lock();

		await this._restore(eventStore);

		if (this._viewLocker)
			this._viewLocker.unlock();
	}

	/** Restore projection view from event store */
	protected async _restore(eventStore: IEventStore): Promise<void> {
		if (!eventStore)
			throw new TypeError('eventStore argument required');
		if (typeof eventStore.getEventsByTypes !== 'function')
			throw new TypeError('eventStore.getEventsByTypes must be a Function');

		let lastEvent: IEvent | undefined;

		if (this._eventLocker) {
			this._logger?.debug('retrieving last event projected');
			lastEvent = await this._eventLocker.getLastEvent();
		}

		this._logger?.debug(`retrieving ${lastEvent ? `events after ${describe(lastEvent)}` : 'all events'}...`);

		const messageTypes = (this.constructor as typeof AbstractProjection).handles;
		const eventsIterable = eventStore.getEventsByTypes(messageTypes, { afterEvent: lastEvent });

		let eventsCount = 0;
		const startTs = Date.now();

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
				eventsCount += 1;
			}
			catch (err) {
				this._onRestoringError(err, event);
			}
		}

		this._logger?.info(`view restored from ${eventsCount} event(s) in ${Date.now() - startTs} ms`);
	}

	/** Handle error on restoring. Logs and throws error by default */
	protected _onRestoringError(error: Error, event: IEvent) {
		this._logger?.error(`view restoring has failed (view will remain locked): ${error.message}`, {
			service: getClassName(this),
			event,
			stack: error.stack
		});
		throw error;
	}
}
