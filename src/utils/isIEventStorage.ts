import { IEventStorage } from "../interfaces";

export const isIEventStorage = (storage: IEventStorage): storage is IEventStorage => storage
	&& typeof storage.getNewId === 'function'
	&& typeof storage.commitEvents === 'function'
	&& typeof storage.getEventsByTypes === 'function'
	&& typeof storage.getAggregateEvents === 'function'
	&& typeof storage.getSagaEvents === 'function';
