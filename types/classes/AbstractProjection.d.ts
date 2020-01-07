namespace NodeCqrs {

	/** Base class for Projection definition */
	declare abstract class AbstractProjection implements IProjection {

		/** List of event types being handled by projection. Can be overridden in projection implementation */
		static readonly handles: Array<string>;

		/** View associated with projection */
		readonly view: IProjectionView<any>;

		/**
		 * Indicates if view should be restored from EventStore on start.
		 * Override for custom behavior.
		 */
		readonly shouldRestoreView: boolean | Promise<boolean>;

		/** Creates an instance of AbstractProjection */
		constructor(options?: { view?: IProjectionView<any>, logger?: ILogger }): void;

		/** Subscribe to event store */
		subscribe(eventStore: IEventStore): Promise<void>;

		/** Pass event to projection event handler */
		project(event: IEvent): Promise<void>;

		/** Restore projection view from event store */
		restore(eventStore: IEventStore): Promise<void>;
	}
}
