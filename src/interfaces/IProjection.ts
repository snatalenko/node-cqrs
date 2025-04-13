import { IEvent } from './IEvent';
import { IEventStore } from './IEventStore';
import { IObserver } from './IObserver';

export interface IProjection<TView> extends IObserver {
	readonly view: TView;

	subscribe(eventStore: IEventStore): Promise<void>;

	project(event: IEvent): Promise<void>;
}

export interface IProjectionConstructor {
	new(c?: any): IProjection<any>;
	readonly handles?: string[];
}

export interface IViewFactory<TView> {
	(options: { schemaVersion: string }): TView;
}
