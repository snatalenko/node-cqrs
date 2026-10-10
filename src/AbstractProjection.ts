import type { Tracer } from '@opentelemetry/api';
import { describe } from './Event.ts';
import { InMemoryView } from './in-memory/InMemoryView.ts';
import { recordSpanError, spanAttributes, spanContext } from './telemetry/index.ts';
import {
	type IViewLocker,
	type IEventLocker,
	type IEventTracker,
	type IProjection,
	type ILogger,
	type IExtendableLogger,
	type IEvent,
	type IObservable,
	type IEventStorageReader,
	isViewLocker,
	isEventLocker,
	isEventTracker,
	isTransactionalView
} from './interfaces/index.ts';

import {
	getClassName,
	validateHandlers,
	getHandler,
	subscribe,
	getMessageHandlerNames,
	assertFunction
} from './utils/index.ts';

type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Event tracker type of a projection with the given view type:
 * the view type, when it implements IEventTracker, otherwise `IEventTracker | null`
 */
export type DefaultEventTracker<TView> =
	IsAny<TView> extends true ? IEventTracker | null :
		TView extends IEventTracker ? TView : IEventTracker | null;

export type AbstractProjectionParams<
	T,
	TEventTracker extends IEventTracker | null = DefaultEventTracker<T>
> = {

	/**
	 * The default view associated with the projection.
	 * Can optionally implement IViewLocker and/or IEventTracker.
	 */
	view?: T,

	/**
	 * Manages view restoration state to prevent early access to an inconsistent view
	 * or conflicts from concurrent restoration by other processes.
	 */
	viewLocker?: IViewLocker,

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes,
	 * and allows awaiting projection of specific events.
	 * Ignored, when the object does not implement IEventTracker.
	 */
	eventTracker?: NonNullable<TEventTracker>,

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes.
	 * Used when no event tracker is available.
	 *
	 * @deprecated Use `eventTracker`
	 */
	eventLocker?: IEventLocker,

	logger?: ILogger | IExtendableLogger,

	tracerFactory?: (name: string) => Tracer
}

/**
 * Base class for Projection definition
 *
 * @typeParam TView - Type of the view maintained by the projection
 * @typeParam TEventTracker - Type of the projection event tracker.
 * Defaults to `TView`, when it implements IEventTracker, otherwise to `IEventTracker | null`
 */
export abstract class AbstractProjection<
	TView = any,
	TEventTracker extends IEventTracker | null = DefaultEventTracker<TView>
> implements IProjection<TView> {

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
	#eventTracker?: IEventTracker | null;
	protected _logger?: ILogger;
	readonly #serviceName: string;
	readonly #tracer: Tracer | undefined;

	/**
	 * The default view associated with the projection.
	 * Can optionally implement IViewLocker and/or IEventTracker.
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
	 * Used when no event tracker is available.
	 *
	 * @deprecated Use `eventTracker`
	 */
	protected get _eventLocker(): IEventLocker | null {
		if (this.#eventLocker === undefined)
			this.#eventLocker = isEventLocker(this.view) ? this.view : null;

		return this.#eventLocker;
	}

	/**
	 * @deprecated Use `eventTracker`
	 */
	protected set _eventLocker(value: IEventLocker | undefined | null) {
		this.#eventLocker = value;
	}

	/**
	 * Tracks event processing state to prevent concurrent handling by multiple processes,
	 * and allows awaiting until specific events are projected.
	 *
	 * Unless assigned explicitly, defaults to the event locker, when it implements IEventTracker,
	 * since waits are resolved once events are marked as projected through the same instance.
	 * `null` when the projection has no event tracker.
	 *
	 * The type reflects the default wiring: assigning another view, a deprecated `eventLocker`,
	 * or an object not implementing IEventTracker can result in `null` regardless of the type.
	 */
	public get eventTracker(): TEventTracker {
		if (this.#eventTracker !== undefined)
			return this.#eventTracker as TEventTracker;

		const eventLocker = this._eventLocker;
		return (isEventTracker(eventLocker) ? eventLocker : null) as TEventTracker;
	}

	/**
	 * Assigns the event tracker. Objects not implementing IEventTracker are replaced with `null`,
	 * which disables the event tracker.
	 */
	protected set eventTracker(value: TEventTracker) {
		this.#eventTracker = isEventTracker(value) ? value : null;
	}

	/** Event tracker or, when not available, the deprecated event locker used to process events */
	get #eventProcessingTracker(): IEventTracker | IEventLocker | null {
		return this.eventTracker ?? this._eventLocker;
	}

	constructor({
		view,
		viewLocker,
		eventTracker,
		eventLocker,
		tracerFactory,
		logger
	}: AbstractProjectionParams<TView, TEventTracker> = {}) {
		validateHandlers(this);

		this.#view = view;
		this.#viewLocker = viewLocker;
		this.#eventLocker = eventLocker;
		if (eventTracker !== undefined)
			this.eventTracker = eventTracker;
		this.#serviceName = getClassName(this);
		this.#tracer = tracerFactory?.(this.#serviceName);

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

	/**
	 * Pass event to projection event handler.
	 * Runs within the view transaction, when the view implements ITransactionalView.
	 */
	async project(event: IEvent, meta?: Record<string, any>): Promise<void> {
		if (this._viewLocker && !this._viewLocker.ready) {
			this._logger?.debug(`view is locked, awaiting until it is ready to process ${describe(event)}`);
			await this._viewLocker.once('ready');
			this._logger?.debug(`view is ready, processing ${describe(event)}`);
		}

		const otelSpan = this.#tracer?.startSpan(`${this.#serviceName}.project ${event.type}`,
			spanAttributes('projection', event, ['type', 'aggregateId']),
			spanContext(meta)
		);

		try {
			if (isTransactionalView(this.view))
				await this.view.runInTransaction(() => this._project(event, meta));
			else
				await this._project(event, meta);
		}
		catch (error: any) {
			// Handler failures are already reported by _project, but the transaction can fail on commit as well
			this.eventTracker?.markAsFailed?.(event, error);
			recordSpanError(otelSpan, error);
			throw error;
		}
		finally {
			otelSpan?.end();
		}
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

		const tracker = this.#eventProcessingTracker;

		if (tracker) {
			const eventLockObtained = await tracker.tryMarkAsProjecting(event);
			if (!eventLockObtained)
				return;
		}

		try {
			await handler.call(this, event);

			if (tracker) {
				await tracker.markAsProjected(event);
				if (this.shouldRecordLastEvent(event, meta))
					await tracker.markAsLastEvent(event);
			}
		}
		catch (error: unknown) {
			this.eventTracker?.markAsFailed?.(event, error);
			throw error;
		}
	}

	/**
	 * Restore view state from not-yet-projected events.
	 *
	 * Lock the view to ensure same restoring procedure
	 * won't be performed by another projection instance.
	 * */
	async restore(eventStore: IEventStorageReader): Promise<void> {
		const span = this.#tracer?.startSpan(`${this.#serviceName}.restore`);

		try {
			if (this._viewLocker)
				await this._viewLocker.lock();

			await this._restore(eventStore);

			if (this._viewLocker)
				this._viewLocker.unlock();
		}
		catch (error: any) {
			recordSpanError(span, error);
			throw error;
		}
		finally {
			span?.end();
		}
	}

	/** Restore view state from not-yet-projected events */
	protected async _restore(eventStore: IEventStorageReader): Promise<void> {
		assertFunction(eventStore?.getEventsByTypes, 'eventStore.getEventsByTypes');

		let lastEvent: IEvent | undefined;
		const tracker = this.#eventProcessingTracker;

		if (tracker) {
			this._logger?.debug('retrieving last event projected');
			lastEvent = await tracker.getLastEvent();
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

		if (tracker && lastRestoredEvent)
			await tracker.markAsLastEvent(lastRestoredEvent);

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
