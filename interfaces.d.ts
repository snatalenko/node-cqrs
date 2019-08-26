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

	getAllEvents(eventTypes: string[], filter?: EventFilter): AsyncIterableIterator<IEvent>;
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

// region CqrsDomainContainer

declare interface IFactory<T> {
	(...args: any[]): T;
};

declare interface IConstructor<T> {
	new(...args: any[]): T;
};

declare type ITypeOrFactory<T> = IConstructor<T> | IFactory<T>;

declare interface IContainer { }

declare interface IContainerBuilder {
	constructor(): void;
	readonly instances: Map<string, object>;
	readonly factories: Set<(container: object) => object>;

	register<T>(typeOrFactory: ITypeOrFactory<T>, exposeAs?: string, exposeMap?: (instance: object) => object): void;
	registerInstance(instance: any, exposeAs: string): void;

	createUnexposedInstances(): void;
	createAllInstances(): void;
	createInstance<T>(typeOrFactory: ITypeOrFactory<T>, additionalOptions: Object): Object;
}

declare interface ICqrsDomainContainerBuilder extends IContainerBuilder {
	registerCommandHandler(typeOrFactory: ITypeOrFactory<ICommandHandler>): void;
	registerEventReceptor(typeOrFactory: ITypeOrFactory<IEventReceptor>): void;
	registerProjection(typeOrFactory: ITypeOrFactory<IProjection>, alias?: string): void;
	registerAggregate(typeOrFactory: ITypeOrFactory<IAggregate>): void;
	registerSaga(typeOrFactory: ITypeOrFactory<ISaga>): void;
}

// endregion

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
	makeSnapshot?(): any;
	restoreSnapshot?(snapshotEvent: IEvent): void;
}

declare type TAggregateParams = { id: Identifier, events?: IEventStream, state?: IAggregateState };
declare type IAggregateFactory = (options: TAggregateParams) => IAggregate;

declare interface IAggregateConstructor {
	new(options: TAggregateParams): IAggregate;
	readonly handles?: string[];
}

declare interface ICommandHandler {
	subscribe(commandBus: ICommandBus): void;
}

// endregion Aggregate

// region Saga

declare interface ISaga {
	readonly id: Identifier;
	readonly version: number;
	readonly uncommittedMessages: ICommand[];
	readonly restored?: boolean;

	apply(event: IEvent): void | Promise<void>;
	enqueue(commandType: string, aggregateId: Identifier, payload: any): void;
	enqueueRaw(command: ICommand): void;

	resetUncommittedMessages(): void;
	onError?(err: Error, params: { event: IEvent, command: ICommand }): void;
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
	get(key: any): Promise<TRecord>;
}

declare interface IConcurrentView<TRecord> extends IProjectionView<TRecord> {
	ready: boolean;
	lock(): Promise<void>;
	unlock(): Promise<void>;
	once(eventType: "ready"): Promise<void>;
}

// endregion Projection

// region Observable / Observer

declare type IMessageHandler = (message: IMessage) => void;

declare interface IObservable {
	on(type: string, handler: IMessageHandler): void;
	queue?(name: string): IObservable;
}

declare type TSubscribeOptions = {
	messageTypes?: string[],
	masterHandler?: IMessageHandler,
	queueName?: string
}

declare interface IObserver {
	subscribe(obervable: IObservable): void;
}

// endregion


declare type EventFilter = { afterEvent?: IEvent; beforeEvent?: IEvent; };

declare interface IEventEmitter extends IObservable {
	on?(messageType: string, handler: IMessageHandler): void;
	off?(messageType: string, handler: IMessageHandler): void;
}

declare interface IEventStorage extends IEventEmitter {
	getNewId(): Identifier | Promise<Identifier>;

	commitEvents(events: ReadonlyArray<IEvent>):
		Promise<any>;

	getAggregateEvents(aggregateId: Identifier, options: { snapshot: IEvent }):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;

	getSagaEvents(sagaId: Identifier, filter: EventFilter):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;

	getEvents(eventTypes: string[]):
		Promise<IEventStream> | AsyncIterableIterator<IEvent>;
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
