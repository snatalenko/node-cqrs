import { IMessageBus } from "../interfaces";
import { isIObservable } from ".";

export const isIMessageBus = (bus: IMessageBus | any): bus is IMessageBus => bus
	&& isIObservable(bus)
	&& 'send' in bus
	&& typeof bus.send === 'function'
	&& 'publish' in bus
	&& typeof bus.publish === 'function';
