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

/**
 * Base class for Projection definition
 */
export default abstract class AbstractProjection<TView extends IConcurrentView> implements IProjection<TView> {

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
		return this.#view || (this.#view = (new InMemoryView() as unknown) as TView);
	}

	#view: TView | undefined;

	#logger?: ILogger;

	#projectionSequence = Promise.resolve();

	/** 
	 * Contains data schema version for the projection.
	 * Used to resolve schema compatibility with the view data
	 */
	abstract schemaVersion: string;

	/**
	 * Creates an instance of AbstractProjection
	 */
	constructor({ view, logger }: {
		view?: TView,
		logger?: ILogger | IExtendableLogger
	} = {}) {
		validateHandlers(this);

		this.#view = view;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
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
	 * Add operation to projection sequence
	 */
	private _enqueue(op: () => Promise<any>): Promise<any> {
		this.#projectionSequence = this.#projectionSequence.then(op);
		return this.#projectionSequence;
	}

	/**
	 * Pass event to projection event handler
	 */
	async project(event: IEvent): Promise<void> {
		// If underlying view expects writes from multiple projection instances
		// 1) view should be locked on each write
		// 2) write operation must be canceled if view version differs from projection version

		return this._enqueue(() => this._project(event));
	}

	/**
	 * Pass event to projection event handler without awaiting for restore operation to complete
	 */
	protected async _project(event: IEvent): Promise<void> {
		const handler = getHandler(this, event.type);
		if (!handler)
			throw new Error(`'${event.type}' handler is not defined or not a function`);

		await handler.call(this, event);
		await this.view.saveLastEvent(event);
	}

	/**
	 * Restore projection view from event store
	 */
	async restore(eventStore: IEventStore): Promise<void> {
		return this._enqueue(async () => {
			try {
				const locked = await this.view.lock();
				if (!locked)
					throw new Error('View lock could have not been acquired for current state restoring');

				const viewSchemaVersion = await this.view.getSchemaVersion();
				const versionMatches = viewSchemaVersion === this.schemaVersion;
				if (!versionMatches) {
					this.#logger?.info(`View version (${viewSchemaVersion}) does not match projection version (${this.schemaVersion}), view data is obsolete`);
					await this.view.changeSchemaVersion(this.schemaVersion);
				}

				const lastEvent = versionMatches ? await this.view.getLastEvent() : undefined;

				await this._restore(eventStore, lastEvent);
			}
			finally {
				await this.view.unlock();
			}
		});
	}

	/**
	 * Restore projection view from event store
	 */
	protected async _restore(eventStore: IEventStore, afterEvent?: IEvent): Promise<void> {
		const started = Date.now();
		this.#logger?.debug('Retrieving events and restoring projection view...');

		const messageTypes = getHandledMessageTypes(this);
		const eventsIterable = eventStore.getEventsByTypes(messageTypes, { afterEvent });

		// TODO: start accepting new events thru `project` method

		for await (const event of eventsIterable) {
			try {
				await this._project(event);
			}
			catch (error) {
				this.#logger?.error(`View restoring has failed: ${error?.message}`, {
					event,
					stack: error?.stack
				});
				throw error;
			}
		}

		this.#logger?.info(`View restored in ${Date.now() - started} ms`);
	}
}
