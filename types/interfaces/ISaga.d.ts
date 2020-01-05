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
