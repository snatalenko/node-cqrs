import { IMessage } from "./IMessage";

export type IEvent<TPayload = any> = IMessage<TPayload> & {
	/** Unique event identifier */
	id?: string;
};
