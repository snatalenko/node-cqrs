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

/**
 * @deprecated Try to use `IEventStream` instead
 */
export type IEventSet = ReadonlyArray<Readonly<IEvent>>;

export type IEventStream = AsyncIterableIterator<Readonly<IEvent>>;


/**
 * Minimum aggregate interface, as it's used by default `AggregateCommandHandler`
 */
export interface IAggregate {

	/** Unique aggregate identifier */
	readonly id: Identifier;

	/** Main entry point for aggregate commands */
	handle(command: ICommand): void | Promise<void>;

	/** List of events emitted by Aggregate as a result of handling command(s) */
	readonly changes: IEventSet;

	/** An indicator if aggregate snapshot should be taken */
	readonly shouldTakeSnapshot?: boolean;

	/** Take an aggregate state snapshot and add it to the changes queue */
	takeSnapshot(): void;
}

export interface IMutableAggregateState {
	// schemaVersion?: number;
	// constructor: IAggregateStateConstructor;
	mutate(event: IEvent): void;
}

// export interface IAggregateStateConstructor extends Function {
// 	schemaVersion?: number;
// 	new(): IAggregateState;
// }

export type IAggregateConstructorParams<TState extends IMutableAggregateState | object | void> = {
	/** Unique aggregate identifier */
	id: Identifier,

	/** Aggregate events, logged after latest snapshot */
	events?: IEventSet,

	/** Aggregate state instance */
	state?: TState
};

export interface IAggregateConstructor<TState extends IMutableAggregateState | object | void> {
	readonly handles?: string[];
	new(options: IAggregateConstructorParams<TState>): IAggregate;
}

export type IAggregateFactory<TState extends IMutableAggregateState | object | void> =
	(options: IAggregateConstructorParams<TState>) => IAggregate;

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

export type ISagaConstructorParams = {
	id: Identifier,
	events?: IEventSet
};

export type ISagaFactory = (options: ISagaConstructorParams) => ISaga;

export interface ISagaConstructor {
	new(options: ISagaConstructorParams): ISaga;

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
		Promise<IEventSet>;

	sendRaw(command: ICommand):
		Promise<IEventSet>;

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

	commitEvents(events: IEventSet): Promise<IEventSet>;

	getEvents(eventTypes?: Readonly<string[]>): IEventStream;

	getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): Promise<IEventSet>;

	getSagaEvents(sagaId: Identifier, options: Pick<IEventQueryFilter, "beforeEvent">): Promise<IEventSet>;
}

export interface IEventStore extends IObservable {
	readonly snapshotsSupported?: boolean;

	getNewId(): Identifier | Promise<Identifier>;

	commit(events: IEventSet): Promise<IEventSet>;

	getAllEvents(eventTypes?: Readonly<string[]>): IEventStream;

	getAggregateEvents(aggregateId: Identifier, options?: { snapshot?: IEvent }): Promise<IEventSet>;

	getSagaEvents(sagaId: Identifier, options: Pick<IEventQueryFilter, "beforeEvent">): Promise<IEventSet>;

	once(messageTypes: string | string[], handler?: IMessageHandler, filter?: (e: IEvent) => boolean): Promise<IEvent>;

	queue(name: string): IObservable;

	registerSagaStarters(startsWith: string[] | undefined): void;
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

	subscribe(eventStore: IEventStore): Promise<void>;

	project(event: IEvent): Promise<void>;
}

export interface IProjectionConstructor {
	new(c?: any): IProjection<any>;
	readonly handles?: string[];
}

// export type ProjectionViewFactoryParams = {
// 	schemaVersion: string,
// 	collectionName: string
// }

export interface IViewFactory<TView> {
	(): TView;
}

export interface ILockable {
	lock(): Promise<any>;
	unlock(): Promise<any>;
}

export interface ILockableWithIndication extends ILockable {
	locked: Readonly<boolean>;
	once(event: 'unlocked'): Promise<void>;
}

export interface IProjectionView extends ILockable {

	/**
	 * Indicates if view is ready for new events projecting
	 */
	ready: boolean;

	/**
	 * Lock the view for external reads/writes
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
}

export interface IPersistentView extends IProjectionView {

	/**
	 * Get last projected event
	 */
	getLastEvent(): Promise<IEvent | undefined>;

	/**
	 * Mark event as projecting to prevent its handling by another
	 * projection instance working with the same storage.
	 *
	 * @returns False value if event is already processing or processed
	 */
	tryMarkAsProjecting(event: IEvent<any>): Promise<boolean>;

	/**
	 * Mark event as projected
	 */
	markAsProjected(event: IEvent<any>): Promise<void>;
}


/** Snapshots */

type TSnapshot<TPayload = object> = {
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

interface ISnapshotStorage {
	getSnapshot(id: Identifier): Promise<TSnapshot>;
	saveSnapshot(id: Identifier, snapshot: TSnapshot): Promise<void>;
}

type ISnapshotEvent<TPayload> = IEvent<TSnapshot<TPayload>>;

export interface IAggregateSnapshotStorage {
	getAggregateSnapshot<TState>(aggregateId: Identifier): Promise<IEvent<TState> | undefined> | IEvent<TState> | undefined;

	saveAggregateSnapshot<TState>(snapshotEvent: IEvent<TState>): Promise<void> | void;
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
