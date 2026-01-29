import type { IObservable } from './IObservable.ts';

export interface IObserver {
	subscribe(observable: IObservable): void;
}
