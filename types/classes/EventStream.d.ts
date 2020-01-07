namespace NodeCqrs {

	/** An immutable collection of events */
	declare class EventStream extends Array implements IEventStream {

		/** Creates an instance of EventStream */
		constructor(args: IEvent | Array<IEvent> | ReadonlyArray<IEvent>): void;

		/** Create new EventStream with events that match certain condition */
		filter(condition: function): EventStream;

		/** Map stream events to another collection */
		map<TResult>(mapFn: function): Array<TResult>;

		/** Returns a string description of event stream */
		toString(): string;
	}
}
