import { IMessage } from "./IMessage";
import { isObject } from "./isObject";

export type IEvent<TPayload = any> = IMessage<TPayload> & {
	/** Unique event identifier */
	id?: string;
};
