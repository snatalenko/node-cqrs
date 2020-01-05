declare interface IProjection extends IObserver {
	readonly view: object;
	subscribe(eventStore: IEventStore): void;
	project(event: IEvent, options?: { nowait: boolean }): Promise<void>;
}

declare interface IProjectionConstructor {
	new(c?: any): IProjection;
	readonly handles?: string[];
}
