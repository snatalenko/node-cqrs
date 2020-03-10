declare interface IMessage<TPayload = any> {
	type: string;
	aggregateId?: Identifier;
	aggregateVersion?: number;
	sagaId?: Identifier;
	sagaVersion?: number;
	payload?: TPayload;
	context?: any;
}

declare type ICommand<T = any> = IMessage<T>;

declare type IEvent<T = any> = IMessage<T> & {
	/** Unique event identifier */
	id?: string;
};

declare type IEventStream = ReadonlyArray<Readonly<IEvent>>;
