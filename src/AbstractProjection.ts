import { InMemoryView } from './infrastructure/InMemoryView';

import {
	IProjectionView,
	IEvent,
	IPersistentView,
	IEventStore,
	IExtendableLogger,
	ILogger,
	IProjection,
	IViewFactory
} from "./interfaces";

import {
	getClassName,
	validateHandlers,
	getHandler,
	getHandledMessageTypes,
	subscribe
} from './utils';

const isProjectionView = (view: IProjectionView) =>
	'ready' in view &&
	'lock' in view &&
	'unlock' in view &&
	'once' in view;

const asProjectionView = (view: any): IProjectionView => (isProjectionView(view) ? view : undefined);

/**
 * Base class for Projection definition
 */
export abstract class AbstractProjection<TView extends IProjectionView | IPersistentView = InMemoryView<any>> implements IProjection<TView> {

	/**
	 * Optional list of event types being handled by projection.
	 * Can be overridden in projection implementation.
	 * If not overridden, will detect event types from event handlers declared on the Projection class
	 */
	static get handles(): string[] | undefined {
		return undefined;
	}

	/**
	 * Default view associated with projection
	 */
	get view(): TView {
		if (!this.#view)
			this.#view = this.#viewFactory();

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
	 */
	get shouldRestoreView(): boolean | Promise<boolean> {
		return (this.view instanceof Map)
			|| (this.view instanceof InMemoryView);
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

		this.#viewFactory = view ?
			() => view :
			viewFactory;

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

		return handler.call(this, event);
	}

	/** Restore projection view from event store */
	async restore(eventStore: IEventStore): Promise<void> {
		// lock the view to ensure same restoring procedure
		// won't be performed by another projection instance
		const concurrentView = asProjectionView(this.view);
		if (concurrentView)
			await concurrentView.lock();

		const shouldRestore = await this.shouldRestoreView;
		if (shouldRestore)
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

		const service = getClassName(this);
		this._logger?.debug('retrieving events and restoring projection...');

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getAllEvents(messageTypes);

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (err) {
				this._onRestoringError(err, event);
			}
		}

		this._logger?.info(`view restored (${this.view})`);
	}

	/** Handle error on restoring. Logs and throws error by default */
	protected _onRestoringError(error: Error, event: IEvent) {
		this._logger?.error(`view restoring failed: ${error.message}`, {
			service: getClassName(this),
			event,
			stack: error.stack
		});
		throw error;
	}
}
