import { IObservable } from "../interfaces";

export const isIObservable = (obj: IObservable | any): obj is IObservable => obj
	&& 'on' in obj
	&& typeof obj.on === 'function'
	&& 'off' in obj
	&& typeof obj.off === 'function';
