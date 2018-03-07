declare type Identifier = string | number;

declare interface IMessage {
	type: string;
	aggregateId?: Identifier;
	aggregateVersion?: number;
	sagaId?: Identifier;
	sagaVersion?: number;
	payload?: any;
	context?: any;
}

declare type ICommand = IMessage;
declare type IEvent = IMessage;
declare type IEventStream = ReadonlyArray<Readonly<IEvent>>;

declare interface IEventStore extends IObservable {
	getNewId(): Promise<Identifier>;

	commit(events: IEventStream): Promise<IEventStream>;

	getAllEvents(eventTypes: string[], filter?: EventFilter): Promise<IEventStream>;
	getAggregateEvents(aggregateId: Identifier): Promise<IEventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<IEventStream>;

	registerSagaStarters(eventTypes: string[]): void;

	once(messageType: string, handler?: IMessageHandler, filter?: function(IEvent): boolean):
		Promise<IEvent>;

	snapshotsSupported?: boolean;
}

declare interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: Identifier, options: { payload?: object, context?: object }):
		Promise<IEventStream>;
	sendRaw(ICommand):
		Promise<IEventStream>;
}

// region Aggregate

declare interface IAggregateState extends Object {
	mutate?(event: IEvent): void;
	[key: string]: any;
}

declare interface IAggregate {
	readonly id: Identifier;
	readonly version: number;
	readonly changes: IEventStream;
	readonly state?: IAggregateState;

	handle(command: ICommand): any;
	mutate(event: IEvent): void;
	emit(eventType: string, payload?: any): void;
	emitRaw(IEvent): void;

	readonly snapshotVersion?: number;
	readonly shouldTakeSnapshot?: boolean;
	takeSnapshot?(): void;
	makeSnapshot?(): IEvent;
	restoreSnapshot?(snapshotEvent: IEvent): void;
}

declare type TAggregateParams = { id: Identifier, events?: IEventStream, state?: IAggregateState };
declare type IAggregateFactory = (options: TAggregateParams) => IAggregate;

declare interface IAggregateConstructor {
	new(options: TAggregateParams): IAggregate;
	readonly handles: string[];
}

declare interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}

// endregion Aggregate

// region Saga

declare interface ISaga {
	readonly id: Identifier;
	readonly version: number;
	readonly uncommittedMessages: ICommand[];
	readonly restored?: boolean;

	apply(event: IEvent): ICommand[];
	enqueue(commandType: string, aggregateId: Identifier, payload: any): void;
	enqueueRaw(command: ICommand): void;

	resetUncommittedMessages(): void;
	onError(err: Error, params: { event: IEvent, command: ICommand }): void;
}

declare type TSagaParams = { id: Identifier, events?: IEventStream };
declare type ISagaFactory = (options: TSagaParams) => ISaga;

declare interface ISagaConstructor {
	new(options: TSagaParams): ISaga;
	readonly startsWith: string[];
	readonly handles: string[];
}

declare interface IEventReceptor extends IObserver {
	subscribe(eventStore: IEventStore): void;
}

// endregion Saga

// region Projection

declare interface IProjection extends IObserver {
	readonly view: object;
	subscribe(eventStore: IEventStore): void;
	project(event: IEvent, options?: { nowait: boolean }): Promise<void>;
}

declare type ViewUpdateCallback = function(any): any;

declare interface IProjectionView<TRecord> {
	readonly ready?: boolean;
	once?(eventType: string): Promise<void>;
	markAsReady?(): void;

	get(key: any): Promise<TRecord>;
}

// endregion Projection

// region Observable / Observer

declare type IMessageHandler = (message: IMessage) => void;

declare interface IObservable {
	on(type: string, handler: IMessageHandler, options?: SubscriptionOptions): void;
}

declare interface IObserver {
	readonly handles?: string[];
	subscribe(obervable: IObservable, messageTypes?: string[], masterHandler?: IMessageHandler | string): void;
}

// endregion


declare type EventFilter = { afterEvent?: IEvent; beforeEvent?: IEvent; };
declare type SubscriptionOptions = { queueName?: string };

declare interface IEventEmitter {
	on?(messageType: string, handler: IMessageHandler, options?: SubscriptionOptions): void;
	off?(messageType: string, handler: IMessageHandler, options?: SubscriptionOptions): void;
}

declare interface IEventStorage extends IEventEmitter {
	getNewId(): Identifier | Promise<Identifier>;
	commitEvents(events: ReadonlyArray<IEvent>): Promise<any>;
	getAggregateEvents(aggregateId: Identifier, options: { snapshot: IEvent }): Promise<IEventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<IEventStream>;
	getEvents(eventTypes: string[], filter: EventFilter): Promise<IEventStream>;
}

declare interface IAggregateSnapshotStorage {
	getAggregateSnapshot(aggregateId: Identifier): Promise<IEvent>;
	saveAggregateSnapshot(IEvent): Promise<void>;
}

declare interface IMessageBus extends IEventEmitter {
	send(command: ICommand): Promise<any>;
	publish(event: IEvent): Promise<any>;
}

// endregion

declare interface IConstructor<T> {
	new(...args: any[]): T;
}
declare type TOF = ((...args: any[]) => object) | IConstructor<object>;
