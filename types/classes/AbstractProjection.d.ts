namespace NodeCqrs {

	/** Base class for Projection definition */
	declare abstract class AbstractProjection implements IProjection {

		/**
		 * Optional list of event types being handled by projection.
		 * Can be overridden in projection implementation.
		 * If not overridden, will detect event types from event handlers declared on the Projection class
		 */
		static readonly handles: Array<string>;

		/**
		 * Default view associated with projection.
		 * If not defined, an instance of `NodeCqrs.InMemoryView` is created on first access.
		 */
		readonly view;

		/**
		 * Indicates if view should be restored from EventStore on start.
		 * Override for custom behavior.
		 */
		readonly shouldRestoreView: boolean | Promise<boolean>;

		/** Creates an instance of AbstractProjection */
		constructor(options?: { view?: any, logger?: ILogger }): void;

		/** Subscribe to event store */
		subscribe(eventStore: IEventStore): Promise<void>;

		/** Pass event to projection event handler */
		project(event: IEvent): Promise<void>;

		/** Restore projection view from event store */
		restore(eventStore: IEventStore): Promise<void>;
	}
}
