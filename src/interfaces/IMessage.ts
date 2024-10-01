export interface IMessage<TPayload = any> {
	/** Event or command type */
	type: string;

	aggregateId?: string;
	aggregateVersion?: number;

	sagaId?: string;
	sagaVersion?: number;

	payload?: TPayload;
	context?: any;
}
