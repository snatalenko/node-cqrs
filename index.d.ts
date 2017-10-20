declare type AggeregateId = string | number;
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
declare type EventStream = IEvent[];

declare interface IAggregate {
	readonly id: Identifier;
	readonly version: number;
	readonly changes: EventStream;

	new(options: { id: Identifier, events: EventStream, state?: object }): IAggregate;

	handle(command: ICommand): any;
	mutate(event: IEvent): void;
	emit(eventType: string, payload: any): void;
	emitRaw(IEvent): void;

	readonly snapshotVersion: number;
	readonly shouldTakeSnapshot: boolean;
	takeSnapshot(): void;
	makeSnapshot(): IEvent;
	restoreSnapshot(snapshotEvent: IEvent): void;
}

declare interface IProjection {
	readonly view: IProjectionView;
	subscribe(eventStore: object): void;
	project(event: IEvent, options?: { nowait: boolean }): Promise<void>;
}

declare interface ISaga {
	readonly id: Identifier;
	readonly version: number;
	readonly uncommittedMessages: ICommand[];

	new(options: { id: Identifier, events: EventStream }): ISaga;

	apply(event: IEvent): ICommand[];
	enqueue(commandType: string, aggregateId: Identifier, payload: any): void;
	enqueueRaw(command: ICommand): void;

	resetUncommittedMessages(): void;
	onError(err: Error, params: { event: IEvent, command: ICommand }): void;
}

declare interface IEventStore extends IObservable {
	getNewId(): Promise<Identifier>;

	commit(events: IEvent[], options?: { sourceCommand: ICommand }): Promise<EventStream>;

	getAllEvents(eventTypes: string[], filter?: EventFilter): Promise<EventStream>;
	getAggregateEvents(aggregateId: Identifier): Promise<EventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<EventStream>;

	once(messageType: string, handler?: IMessageHandler, filter?: function(IEvent): boolean):
		Promise<IEvent>;
}

declare interface ICommandBus extends IObservable {
	send(commandType: string, aggregateId: Identifier, options: { payload?: object, context?: object }):
		Promise<EventStream>;
	sendRaw(ICommand):
		Promise<EventStream>;
}

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

// region infrastructure services

declare type EventFilter = { afterEvent?: IEvent; beforeEvent?: IEvent; };
declare type SubscriptionOptions = { queueName?: string };

declare interface IEventStorage {
	getNewId(): Identifier | Promise<Identifier>;
	commitEvents(events: IEvent[]): Promise<any>;
	getAggregateEvents(aggregateId: Identifier, options: { snapshot: IEvent }): Promise<EventStream>;
	getSagaEvents(sagaId: Identifier, filter: EventFilter): Promise<EventStream>;
	getEvents(eventTypes: string[], filter: EventFilter): Promise<EventStream>;
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

declare type ViewUpdateCallback = function(any): any;

declare interface IProjectionView {
	readonly ready: boolean;

	has(key: string): boolean;
	get(key: string, options?: { nowait: boolean }): Promise<object>;
	create(key: string, update: ViewUpdateCallback | any): Promise<void>;
	update(key: string, update: ViewUpdateCallback): Promive<void>;
	updateEnforcingNew(key: string, update: ViewUpdateCallback): Promise<void>;
	updateAll(filter: function(any): boolean, update: ViewUpdateCallback): Promise<void>;
	delete(key: string): Promise<void>;
	deleteAll(filter: function(any): boolean): Promise<void>;
}

// endregion
