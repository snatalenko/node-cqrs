export type Identifier = string | number;

export interface IMessage<TPayload = any> {
	/** Event or command type */
	type: string;

	aggregateId?: Identifier;
	aggregateVersion?: number;

	sagaId?: Identifier;
	sagaVersion?: number;

	payload?: TPayload;
	context?: any;
}

export type ICommand<TPayload = any> = IMessage<TPayload>;

export type IEvent<TPayload = any> = IMessage<TPayload> & {
	/** Unique event identifier */
	id?: string;
};

export type IEventStream = ReadonlyArray<Readonly<IEvent>>;


/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
export interface IAggregate {

	/** Unique aggregate identifier */
	readonly id: Identifier;

	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** List of events emitted by Aggregate as a result of handling command(s) */
	readonly changes: IEventStream;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Create aggregate snapshot */
	makeSnapshot?(): TSnapshot;
}

export interface IAggregateState {
	schemaVersion?: number;
	constructor: IAggregateStateConstructor;
}

export interface IAggregateStateConstructor extends Function {
	schemaVersion?: number;
	new(): IAggregateState;
}

export type TAggregateConstructorParams<TState extends IAggregateState> = {
	/** Unique aggregate identifier */
	id: Identifier,

	/** Aggregate state snapshot, if any */
	snapshot?: TSnapshot<TState>,

	/** Aggregate events, logged after latest snapshot */
	events?: IEventStream,

	/** Aggregate state instance */
	state?: TState
};

export interface IAggregateConstructor<TState extends IAggregateState> {
	readonly handles?: string[];
	new(options: TAggregateConstructorParams<TState>): IAggregate;
}

export type IAggregateFactory<TState extends IAggregateState> = (options: TAggregateConstructorParams<TState>) => IAggregate;

export interface ISaga {
	/** Unique Saga ID */
	readonly id: Identifier;

	/** List of commands emitted by Saga */
	readonly uncommittedMessages: ICommand[];

	/** Main entry point for Saga events */
	apply(event: IEvent): void | Promise<void>;

	/** Reset emitted commands when they are not longer needed */
	resetUncommittedMessages(): void;

	onError?(error: Error, options: { event: IEvent, command: ICommand }): void;
}

export type TSagaConstructorParams = {
	id: Identifier,
	events?: IEventStream
};

export type ISagaFactory = (options: TSagaConstructorParams) => ISaga;

export interface ISagaConstructor {
	new(options: TSagaConstructorParams): ISaga;

	/** List of event types that trigger new saga start */
	readonly startsWith: string[];

	/** List of events being handled by Saga */
	readonly handles: string[];
}

export interface IMessageHandler {
	(...args: any[]): any | Promise<any>
};

export interface IObservable {
	on(type: string, handler: IMessageHandler): void;

	off(type: string, handler: IMessageHandler): void;

	queue?(name: string): IObservable;
}

export interface IObserver {
	subscribe(observable: IObservable): void;
}

/** Commands */

export interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: Identifier, options: { payload?: object, context?: object }):
		Promise<IEventStream>;

	sendRaw(command: ICommand):
		Promise<IEventStream>;

	on(type: string, handler: IMessageHandler): void;
}

export interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}

/** Events */

export type IEventQueryFilter = {
	/** Get events emitted after this specific event */
	afterEvent?: IEvent;

	/** Get events emitted before this specific event */
	beforeEvent?: IEvent;
}

export interface IEventStorage {
	/**
	 * Create unique identifier 
	 */
	getNewId(): Identifier | Promise<Identifier>;

	/**
	 * Save events to a stream with a given ID
	 * @param streamId
	 * @param events
	 * @returns {Promise<IEventStream>} Stream of events that were committed to the store for the first time
	 */
	commit(streamId: Identifier, events: IEventStream): Promise<IEventStream>;

	/**
	 * Get event stream by a given ID
	 * @param streamId
	 * @param filter
	 */
	getStream(streamId: Identifier, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent>;

	/**
	 * Get events by given event types
	 * @param eventTypes
	 * @param filter
	 */
	getEventsByTypes(eventTypes: Readonly<string[]>, filter?: IEventQueryFilter): AsyncIterableIterator<IEvent>;
}

export interface IEventStore extends IEventStorage, IObservable {
	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;
}

export interface IEventReceptor extends IObserver {
	subscribe(eventStore: IEventStore): void;
}

export interface IMessageBus extends IObservable {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent): Promise<any>;
}


/** Projection */

export interface IProjection<TView extends object> extends IObserver {
	readonly view: TView;

	subscribe(eventStore: IEventStore): void;

	project(event: IEvent, options?: { nowait: boolean }): Promise<void>;
}

export interface IProjectionConstructor {
	new(c?: any): IProjection<any>;
	readonly handles?: string[];
}


export interface IConcurrentView {

	/**
	 * Indicates if view is ready for new events projecting
	 */
	ready: boolean;

	/**
	 * Lock the view for external reads/writes
	 * 
	 * @returns Indicator if view was successfully locked for restoring
	 */
	lock(): Promise<boolean>;

	/**
	 * Unlock external read/write operations
	 */
	unlock(): Promise<void>;

	/**
	 * Wait till the view is ready to accept new events
	 */
	once(eventType: "ready"): Promise<void>;

	/**
	 * Get last projected event
	 */
	getLastEvent(): Promise<IEvent | undefined>;

	/**
	 * Save last projected event
	 */
	saveLastEvent(event: IEvent): Promise<void>;

	/**
	 * Schema version of the data being projected to the view
	 */
	getSchemaVersion(): Promise<string>;

	/**
	 * Update data schema version, reset the view and lastEvent
	 */
	changeSchemaVersion(version: string): Promise<void>;
}


/** Snapshots */

export type TSnapshot<TPayload = object> = {
	/** 
	 * Schema version of the data stored in `state` property.
	 * Snapshots with older schema versions must be passed thru a data migration before applying for a newer schema
	 */
	schemaVersion: string | number;

	/**
	 * Last event that was processed before making a snapshot
	 */
	lastEvent: IEvent;

	/**
	 * Snapshot data
	 */
	data: TPayload;
}

export interface ISnapshotStorage {
	getSnapshot(id: Identifier): Promise<TSnapshot>;
	saveSnapshot(id: Identifier, snapshot: TSnapshot): Promise<void>;
}

type ISnapshotEvent<TPayload> = IEvent<TSnapshot<TPayload>>;

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier): Promise<ISnapshotEvent<TState> | undefined>;

	saveAggregateSnapshot<TState>(snapshotEvent: ISnapshotEvent<TState>): Promise<void>;
}


/** Interfaces */

export interface ILogger {
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: { [key: string]: any }): void;
	debug(message: string, meta?: { [key: string]: any }): void;
	info(message: string, meta?: { [key: string]: any }): void;
	warn(message: string, meta?: { [key: string]: any }): void;
	error(message: string, meta?: { [key: string]: any }): void;
}

export interface IExtendableLogger extends ILogger {
	child(meta?: { [key: string]: any }): IExtendableLogger;
}
