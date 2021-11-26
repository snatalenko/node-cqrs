'use strict';

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

import { getClassName, validateHandlers, getHandler, getHandledMessageTypes } from './utils';

import subscribe from './subscribe';
import InMemoryView from './infrastructure/InMemoryView';

const asPersistentView = <T extends IProjectionView | IPersistentView>(view: T): IPersistentView | undefined =>
	('tryMarkAsProjecting' in view && 'markAsProjected' in view && 'getLastEvent' in view) ?
		view :
		undefined;

/**
 * Base class for Projection definition
 */
export default abstract class AbstractProjection<TView extends IProjectionView | IPersistentView> implements IProjection<TView> {

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
		if (!this.#view) {
			this.#view = this.#viewFactory({
				schemaVersion: this.schemaVersion,
				collectionName: this.collectionName
			});
			this.#persistentView = asPersistentView(this.#view);
		}

		return this.#view;
	}

	#viewFactory: IViewFactory<TView>;
	#view?: TView;
	#persistentView: IPersistentView | undefined;

	protected _logger?: ILogger;

	/** 
	 * Contains data schema version for the projection.
	 * Used to resolve schema compatibility with the view data
	 */
	abstract get schemaVersion(): string;

	get collectionName(): string {
		return getClassName(this);
	}

	/**
	 * Creates an instance of AbstractProjection
	 */
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

	/**
	 * Subscribe to event store
	 */
	async subscribe(eventStore: IEventStore): Promise<void> {
		subscribe(eventStore, this, {
			masterHandler: (e: IEvent) => this.project(e),
			queueName: this.collectionName
		});

		await this.restore(eventStore);
	}

	/**
	 * Pass event to projection event handler
	 */
	async project(event: IEvent): Promise<void> {
		try {
			const locked = await this.view.lock();
			if (!locked)
				throw new Error('View lock could have not been acquired for current state restoring');

			await this._project(event);
		}
		finally {
			await this.view.unlock();
		}
	}

	/**
	 * Pass event to projection event handler without awaiting for restore operation to complete
	 */
	protected async _project(event: IEvent): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		const projecting = await this.#persistentView?.tryMarkAsProjecting(event) ?? true;
		if (!projecting)
			return;

		await handler.call(this, event);

		await this.#persistentView?.markAsProjected(event);
	}

	/**
	 * Restore projection view from event store
	 */
	async restore(eventStore: IEventStore): Promise<void> {
		try {
			const locked = await this.view.lock();
			if (!locked)
				throw new Error('View lock could have not been acquired for current state restoring');

			await this._restore(eventStore);
		}
		finally {
			await this.view.unlock();
		}
	}

	/**
	 * Restore projection view from event store
	 */
	protected async _restore(eventStore: IEventStore): Promise<void> {
		const started = Date.now();
		this._logger?.debug('Retrieving events and restoring projection view...');

		const afterEvent = await this.#persistentView?.getLastEvent();
		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getEventsByTypes(messageTypes, { afterEvent });

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (error: any) {
				this._logger?.error(`View restoring has failed: ${error?.message}`, {
					event,
					stack: error?.stack
				});
				throw error;
			}
		}

		this._logger?.info(`View restored in ${Date.now() - started} ms`);
	}
}
