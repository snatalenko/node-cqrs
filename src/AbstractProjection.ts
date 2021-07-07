'use strict';

import {
	IConcurrentView,
	IEvent,
	IEventStore,
	IExtendableLogger,
	ILogger,
	IProjection
} from "./interfaces";

import { getClassName, validateHandlers, getHandler, getHandledMessageTypes } from './utils';

import subscribe from './subscribe';
import InMemoryView from './infrastructure/InMemoryView';

const isConcurrentView = (view: any) =>
	typeof view.lock === 'function' &&
	typeof view.unlock === 'function' &&
	typeof view.once === 'function';

const asConcurrentView = (view: any): IConcurrentView | undefined =>
	(isConcurrentView(view) ? view : undefined);

/**
 * Base class for Projection definition
 */
export default abstract class AbstractProjection<TView extends object> implements IProjection<TView> {

	/**
	 * Optional list of event types being handled by projection.
	 * Can be overridden in projection implementation.
	 * If not overridden, will detect event types from event handlers declared on the Projection class
	 */
	static get handles(): string[] | undefined {
		return undefined;
	}

	/**
	 * Default view associated with projection.
	 * If not defined, an instance of `NodeCqrs.InMemoryView` is created on first access.
	 */
	get view(): TView {
		return this.#view || (this.#view = new InMemoryView() as TView);
	}

	/**
	 * Indicates if view should be restored from EventStore on start.
	 * Override for custom behavior.
	 */
	get shouldRestoreView(): boolean | Promise<boolean> {
		return (this.view instanceof Map)
			|| (this.view instanceof InMemoryView);
	}

	#view: TView | undefined;

	#logger?: ILogger;

	/**
	 * Creates an instance of AbstractProjection
	 */
	constructor(options?: { view?: TView, logger?: ILogger | IExtendableLogger }) {
		validateHandlers(this);

		this.#view = options?.view;
		this.#logger = options?.logger && 'child' in options.logger ?
			options.logger.child({ service: getClassName(this) }) :
			options?.logger;
	}

	/**
	 * Subscribe to event store
	 */
	async subscribe(eventStore: IEventStore): Promise<void> {
		subscribe(eventStore, this, {
			masterHandler: (e: IEvent) => this.project(e)
		});

		await this.restore(eventStore);
	}

	/**
	 * Pass event to projection event handler
	 */
	async project(event: IEvent): Promise<void> {
		const concurrentView = asConcurrentView(this.view);
		if (concurrentView && !concurrentView.ready)
			await concurrentView.once('ready');

		return this._project(event);
	}

	/**
	 * Pass event to projection event handler, without awaiting for restore operation to complete
	 */
	protected async _project(event: IEvent): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		return handler.call(this, event);
	}

	/**
	 * Restore projection view from event store
	 */
	async restore(eventStore: IEventStore): Promise<void> {
		// lock the view to ensure same restoring procedure
		// won't be performed by another projection instance
		const concurrentView = asConcurrentView(this.view);
		if (concurrentView)
			await concurrentView.lock();

		const shouldRestore = await this.shouldRestoreView;
		if (shouldRestore)
			await this._restore(eventStore);

		if (concurrentView)
			concurrentView.unlock();
	}

	/**
	 * Restore projection view from event store
	 */
	protected async _restore(eventStore: IEventStore): Promise<void> {
		/* istanbul ignore if */
		if (!eventStore)
			throw new TypeError('eventStore argument required');
		/* istanbul ignore if */
		if (typeof eventStore.getEventsByTypes !== 'function')
			throw new TypeError('eventStore.getEventsByTypes must be a Function');

		this.#logger?.debug('retrieving events and restoring projection...');

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getEventsByTypes(messageTypes);

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (err) {
				this._onRestoringError(err, event);
			}
		}

		this.#logger?.info(`view restored (${this.view})`);
	}

	/**
	 * Handle error on restoring
	 */
	protected _onRestoringError(error: Error, event: IEvent) {
		this.#logger?.error(`view restoring has failed: ${error.message}`, {
			event,
			stack: error.stack
		});

		throw error;
	}
}
