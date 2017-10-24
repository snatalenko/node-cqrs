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

	commit(events: IEvent[]): Promise<IEventStream>;

	getAllEvents(eventTypes: string[], filter?: EventFilter): Promise<IEventStream>;
	getAggregateEvents(aggregateId: Identifier): Promise<IEventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<IEventStream>;

	once(messageType: string, handler?: IMessageHandler, filter?: function(IEvent): boolean):
		Promise<IEvent>;
}

declare interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: Identifier, options: { payload?: object, context?: object }):
		Promise<IEventStream>;
	sendRaw(ICommand):
		Promise<IEventStream>;
}

// region Aggregate

declare interface IAggregateState {
	mutate?(event: IEvent): void;
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

declare interface IAggregateConstructor {
	new(options: { id: Identifier, events: IEventStream, state?: IAggregateState }): IAggregate;
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

	apply(event: IEvent): ICommand[];
	enqueue(commandType: string, aggregateId: Identifier, payload: any): void;
	enqueueRaw(command: ICommand): void;

	resetUncommittedMessages(): void;
	onError(err: Error, params: { event: IEvent, command: ICommand }): void;
}

declare interface ISagaConstructor {
	new(options: { id: Identifier, events: IEventStream }): ISaga;
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

declare interface IProjectionView {
	readonly ready?: boolean;
	once?(eventType: string): Promise<void>;
	markAsReady?(): void;
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


declare type EventFilter = { aftrEvent?: IEvent; beforeEvent?: IEvent; };
declare type SubscriptionOptions = { queueName?: string };

declare interface IEventStorage {
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

declare interface IMessageBus {
	on(messageType: string, handler: IMessageHandler, options?: SubscriptionOptions): void;
	off?(messageType: string, handler: IMessageHandler, options?: SubscriptionOptions): void;
	removeListener?(messageType: string, handler: IMessageHandler): void;
	send(command: ICommand): Promise<any>;
	publish(event: IEvent): Promise<any>;
}

// endregion

declare interface IConstructor<T> {
	new(...args: any[]): T;
}
declare type TOF = ((...args: any[]) => object) | IConstructor<object>;

declare module 'node-cqrs' {

	declare class Container {
		register(
			typeOrFactory: TOF,
			exposeAs?: string,
			exposeMap?: (container: Container) => object
		): void;
		registerInstance(instance: object, exposeAs: string): void;
		registerCommandHandler(typeOrFactory: TOF);
		registerEventReceptor(typeOrFactory: TOF);
		registerProjection(projection: IConstructor<IProjection>, exposedViewName: string);
		registerAggregate(aggregateType: IAggregateConstructor);
		registerSaga(sagaType: ISagaConstructor);
		createAllInstances(): void;
		createUnexposedInstances(): void;
	}

	declare class EventStream implements IEventStream { }

	declare class CommandBus implements ICommandBus {
		constructor(options: {
			messageBus?: IMessageBus
		});
	}

	declare class EventStore implements IEventStore {
		constructor(options: {
			storage: IEventStorage,
			snapshotStorage?: IAggregateSnapshotStorage,
			messageBus?: IMessageBus,
			eventValidator?: function(IEvent): void,
			eventStoreConfig?: EventStoreConfig
		});
	}

	declare class Observer implements IObserver {
		constructor();
	}

	declare class AbstractAggregate implements IAggregate { }

	declare class AggregateCommandHandler implements ICommandHandler {
		constructor(options: {
			eventStore: IEventStore,
			aggregateType: IAggregateConstructor,
			handles?: string[]
		});
	}

	declare class AbstractSaga implements ISaga { }

	declare class SagaEventHandler implements IEventReceptor {
		constructor(options: {
			sagaType: ISagaConstructor,
			commandBus: ICommandBus,
			queueName?: string,
			handles?: string[]
		});
	}

	declare class AbstractProjection implements IProjection {
		constructor(options?: { view?: object });
	}

	declare class InMemoryMessageBus implements IMessageBus {
		constructor();
	}

	declare class InMemoryEventStorage implements IEventStorage {
		constructor();
	}

	declare class InMemorySnapshotStorage implements IAggregateSnapshotStorage {
		constructor();
	}

	declare class InMemoryView implements IProjectionView {
		constructor();
		has(key: Identifier): boolean;
		get(key: Identifier, options?: { nowait: boolean }): Promise<object>;
		create(key: Identifier, update: ViewUpdateCallback | any): Promise<void>;
		update(key: Identifier, update: ViewUpdateCallback): Promive<void>;
		updateEnforcingNew(key: Identifier, update: ViewUpdateCallback): Promise<void>;
		updateAll(filter: function(any): boolean, update: ViewUpdateCallback): Promise<void>;
		delete(key: Identifier): Promise<void>;
		deleteAll(filter: function(any): boolean): Promise<void>;
	}
}	
