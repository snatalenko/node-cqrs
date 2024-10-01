import { describe } from './Event';
import { InMemoryView } from './infrastructure/memory/InMemoryView';
import {
	IProjectionView,
	IPersistentView,
	IProjection,
	IViewFactory,
	ILogger,
	IExtendableLogger,
	IEventStore,
	IEvent
} from './interfaces';

import {
	getClassName,
	validateHandlers,
	getHandler,
	getHandledMessageTypes,
	subscribe
} from './utils';

const isProjectionView = (view: IProjectionView): view is IProjectionView =>
	'ready' in view &&
	'lock' in view &&
	'unlock' in view &&
	'once' in view;

const asProjectionView = (view: any): IProjectionView | undefined =>
	(isProjectionView(view) ? view : undefined);

const isPersistentView = (view: any): view is IPersistentView =>
	'getLastEvent' in view &&
	'tryMarkAsProjecting' in view &&
	'markAsProjected' in view;

/**
 * Base class for Projection definition
 */
export abstract class AbstractProjection<TView extends IProjectionView | IPersistentView> implements IProjection<TView> {

	/**
	 * Optional list of event types being handled by projection.
	 * Can be overridden in projection implementation.
	 * If not overridden, will detect event types from event handlers declared on the Projection class
	 */
	static get handles(): string[] | undefined {
		return undefined;
	}

	abstract get schemaVersion(): string;

	/**
	 * Default view associated with projection
	 */
	get view(): TView {
		if (!this.#view)
			this.#view = this.#viewFactory({ schemaVersion: this.schemaVersion });

		return this.#view;
	}

	#viewFactory: IViewFactory<TView>;
	#view?: TView;

	protected _logger?: ILogger;

	get collectionName(): string {
		return getClassName(this);
	}

	/**
	 * Indicates if view should be restored from EventStore on start.
	 * Override for custom behavior.
	 * 
	 * @deprecated View must implement `getLastEvent()` instead
	 */
	get shouldRestoreView(): boolean | Promise<boolean> {
		throw new Error('shouldRestoreView is deprecated');
	}

	constructor({
		view,
		viewFactory = InMemoryView.factory,
		logger
	}: {
		view?: TView,
		viewFactory?: IViewFactory<TView>,
		logger?: ILogger | IExtendableLogger
	} = {}) {
		validateHandlers(this);

		this.#view = view;
		this.#viewFactory = viewFactory;

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
		const concurrentView = asProjectionView(this.view);
		if (concurrentView && !concurrentView.ready)
			await concurrentView.once('ready');

		return this._project(event);
	}

	/** Pass event to projection event handler, without awaiting for restore operation to complete */
	protected async _project(event: IEvent): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		const persistentView = isPersistentView(this.view) ? this.view : undefined;
		if (persistentView) {
			const eventLockObtained = await persistentView.tryMarkAsProjecting(event);
			if (!eventLockObtained)
				return;
		}

		await handler.call(this, event);

		if (persistentView)
			await persistentView.markAsProjected(event);
	}

	/** Restore projection view from event store */
	async restore(eventStore: IEventStore): Promise<void> {
		// lock the view to ensure same restoring procedure
		// won't be performed by another projection instance
		const concurrentView = asProjectionView(this.view);
		if (concurrentView)
			await concurrentView.lock();

		await this._restore(eventStore);

		if (concurrentView)
			concurrentView.unlock();
	}

	/** Restore projection view from event store */
	protected async _restore(eventStore: IEventStore): Promise<void> {
		if (!eventStore)
			throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function')
			throw new TypeError('eventStore.getAllEvents must be a Function');

		this._logger?.debug('retrieving last event projected');

		const lastEvent = isPersistentView(this.view) ?
			await this.view.getLastEvent() :
			undefined;

		this._logger?.debug(`retrieving ${lastEvent ? `events after ${describe(lastEvent)}` : 'all events'}...`);

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = lastEvent ?
			eventStore.getEventsByTypes(messageTypes, { afterEvent: lastEvent }) :
			eventStore.getAllEvents(messageTypes);

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

		this._logger?.info(`view restored (${this.view}) from ${eventsCount} event(s) in ${Date.now() - startTs} ms`);
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
