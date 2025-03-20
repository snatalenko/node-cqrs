import { describe } from './Event';
import { InMemoryView } from './infrastructure/memory/InMemoryView';
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
	getHandledMessageTypes,
	subscribe
} from './utils';

export type AbstractProjectionParams<T> = {
	/**
	 * (Optional) Default view associated with the projection
	 */
	view?: T,

	/**
	 * Instance for managing view restoration state to prevent early access to an inconsistent view
	 * or conflicts caused by concurrent restoration by another process.
	 */
	viewLocker?: IViewLocker,

	/**
	 * Instance for tracking event processing state to prevent concurrent processing by multiple processes.
	 */
	eventLocker?: IEventLocker,

	logger?: ILogger | IExtendableLogger
}

/**
 * Base class for Projection definition
 */
export abstract class AbstractProjection<TView = InMemoryView<any>> implements IProjection<TView> {

	/**
	 * Optional list of event types being handled by projection.
	 * Can be overridden in projection implementation.
	 * If not overridden, will detect event types from event handlers declared on the Projection class
	 */
	static get handles(): string[] | undefined {
		return undefined;
	}

	#view: TView;
	#viewLocker?: IViewLocker;
	#eventLocker?: IEventLocker;
	protected _logger?: ILogger;

	public get view(): TView {
		return this.#view;
	}

	protected set view(value: TView) {
		this.#view = value;
	}

	protected get _viewLocker(): IViewLocker | undefined {
		return this.#viewLocker ?? (isViewLocker(this.view) ? this.view : undefined);
	}

	protected get _eventLocker(): IEventLocker | undefined {
		return this.#eventLocker ?? (isEventLocker(this.view) ? this.view : undefined);
	}

	constructor({
		view,
		viewLocker,
		eventLocker,
		logger
	}: AbstractProjectionParams<TView> = {}) {
		validateHandlers(this);

		this.#view = view ?? new InMemoryView() as any;
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

		const messageTypes = getHandledMessageTypes(this);
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

		this._logger?.info(`view restored (${this.#view}) from ${eventsCount} event(s) in ${Date.now() - startTs} ms`);
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
