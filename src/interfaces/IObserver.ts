import { IObservable } from "./IObservable";

export interface IObserver {
	subscribe(observable: IObservable): void;
}
