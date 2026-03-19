import { describe } from './Event.ts';
import { InMemoryView } from './in-memory/InMemoryView.ts';
import {
	type IViewLocker,
	type IEventLocker,
	type IProjection,
	type ILogger,
	type IExtendableLogger,
	type IEvent,
	type IObservable,
	type IEventStorageReader,
	isViewLocker,
	isEventLocker
} from './interfaces/index.ts';

import {
	getClassName,
	validateHandlers,
	getHandler,
	subscribe,
	getMessageHandlerNames,
	assertFunction
} from './utils/index.ts';

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
	#viewLocker?: IViewLocker | null;
	#eventLocker?: IEventLocker | null;
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
	protected get _viewLocker(): IViewLocker | null {
		if (this.#viewLocker === undefined)
			this.#viewLocker = isViewLocker(this.view) ? this.view : null;

		return this.#viewLocker;
	}

	protected set _viewLocker(value: IViewLocker | undefined | null) {
		this.#viewLocker = value;
	}

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes.
	 */
	protected get _eventLocker(): IEventLocker | null {
		if (this.#eventLocker === undefined)
			this.#eventLocker = isEventLocker(this.view) ? this.view : null;

		return this.#eventLocker;
	}

	protected set _eventLocker(value: IEventLocker | undefined | null) {
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

	/**
	 * Subscribe to event store
	 * and restore view state from not yet projected events
	 */
	subscribe(eventStore: IObservable): void {
		subscribe(eventStore, this, {
			masterHandler: this.project
		});
	}

	/** Pass event to projection event handler */
	async project(event: IEvent, meta?: Record<string, any>): Promise<void> {
		if (this._viewLocker && !this._viewLocker.ready) {
			this._logger?.debug(`view is locked, awaiting until it is ready to process ${describe(event)}`);
			await this._viewLocker.once('ready');
			this._logger?.debug(`view is ready, processing ${describe(event)}`);
		}

		return this._project(event, meta);
	}

	/**
	 * Determines whether an event should be recorded as the last projected event (restore checkpoint).
	 * Override in derived classes to control checkpoint behavior based on event metadata.
	 */
	// eslint-disable-next-line class-methods-use-this
	protected shouldRecordLastEvent(_event: IEvent, _meta?: Record<string, any>): boolean {
		return true;
	}

	/** Pass event to projection event handler, without awaiting for restore operation to complete */
	protected async _project(event: IEvent, meta?: Record<string, any>): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		if (this._eventLocker) {
			const eventLockObtained = await this._eventLocker.tryMarkAsProjecting(event);
			if (!eventLockObtained)
				return;
		}

		await handler.call(this, event);

		if (this._eventLocker) {
			await this._eventLocker.markAsProjected(event);
			if (this.shouldRecordLastEvent(event, meta))
				await this._eventLocker.markAsLastEvent(event);
		}
	}

	/**
	 * Restore view state from not-yet-projected events.
	 *
	 * Lock the view to ensure same restoring procedure
	 * won't be performed by another projection instance.
	 * */
	async restore(eventStore: IEventStorageReader): Promise<void> {
		if (this._viewLocker)
			await this._viewLocker.lock();

		await this._restore(eventStore);

		if (this._viewLocker)
			this._viewLocker.unlock();
	}

	/** Restore view state from not-yet-projected events */
	protected async _restore(eventStore: IEventStorageReader): Promise<void> {
		assertFunction(eventStore?.getEventsByTypes, 'eventStore.getEventsByTypes');

		let lastEvent: IEvent | undefined;

		if (this._eventLocker) {
			this._logger?.debug('retrieving last event projected');
			lastEvent = await this._eventLocker.getLastEvent();
		}

		this._logger?.debug(`retrieving ${lastEvent ? `events after ${describe(lastEvent)}` : 'all events'}...`);

		const messageTypes = (this.constructor as typeof AbstractProjection).handles;
		const eventsIterable = eventStore.getEventsByTypes(messageTypes, { afterEvent: lastEvent });

		let eventsCount = 0;
		let lastRestoredEvent: IEvent | undefined;
		const startTs = Date.now();

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
				lastRestoredEvent = event;
				eventsCount += 1;
			}
			catch (err: unknown) {
				this._onRestoringError(err, event);
			}
		}

		if (this._eventLocker && lastRestoredEvent)
			await this._eventLocker.markAsLastEvent(lastRestoredEvent);

		this._logger?.info(`view restored from ${eventsCount} event(s) in ${Date.now() - startTs} ms`);
	}

	/**
	 * Handle error on restoring.
	 *
	 * Logs and throws error by default
	 */
	protected _onRestoringError(error: unknown, event: IEvent) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		this._logger?.error(`view restoring has failed (view remains locked): ${errorMessage}`, {
			service: getClassName(this),
			event,
			error
		});

		throw error;
	}
}
