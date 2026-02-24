import type { MessagePort } from 'node:worker_threads';
import type { IEvent } from '../interfaces/IEvent.ts';

export interface IWorkerData {
	projectionPort: MessagePort,
	viewPort: MessagePort
}

export const isWorkerData = (obj: unknown): obj is IWorkerData =>
	typeof obj === 'object'
	&& obj !== null
	&& 'projectionPort' in obj
	&& !!obj.projectionPort
	&& 'viewPort' in obj
	&& !!obj.viewPort;

export type WorkerInitMessage = { type: 'ready' };

export const isWorkerInitMessage = (msg: unknown): msg is WorkerInitMessage =>
	typeof msg === 'object'
	&& msg !== null
	&& 'type' in msg
	&& msg.type === 'ready';


export interface IRemoteProjectionApi {
	project(event: IEvent): Promise<void> | void;
	_project(event: IEvent): Promise<void> | void;
	ping(): true;
}
