declare interface IProjectionView<TRecord> {
	get(key: any): Promise<TRecord>;
}

declare interface IConcurrentView<TRecord> extends IProjectionView<TRecord> {
	ready: boolean;
	lock(): Promise<void>;
	unlock(): Promise<void>;
	once(eventType: "ready"): Promise<void>;
}

