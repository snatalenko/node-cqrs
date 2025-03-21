import { Identifier } from "./Identifier";

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
