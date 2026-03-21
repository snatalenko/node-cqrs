import { parentPort, workerData } from 'node:worker_threads';
import * as Comlink from 'comlink';
import type { IProjection } from '../../interfaces/index.ts';
import { assertFunction, getMessageHandlerNames, isClass } from '../../utils/index.ts';
import { type WorkerInitMessage, isWorkerData } from '../protocol.ts';
import { nodeEndpoint } from './index.ts';

/**
 * Create and expose a worker-thread projection from a projection class type.
 * The class is instantiated inside the worker with `new ProjectionType()`.
 */
export function createWorkerInstance<TProjection extends IProjection<any>>(
	ProjectionType: new () => TProjection,
	projectionMethodsToWire?: readonly Extract<keyof TProjection, string>[]
): TProjection;

/**
 * Create and expose a worker-thread projection from a projection factory.
 * The factory is executed inside the worker and should return the projection instance.
 */
export function createWorkerInstance<TProjection extends IProjection<any>>(
	projectionFactory: () => TProjection,
	projectionMethodsToWire?: readonly Extract<keyof TProjection, string>[]
): TProjection;

export function createWorkerInstance<TProjection extends IProjection<any>>(
	ProjectionFactoryOrType: (() => TProjection) | (new () => TProjection),
	projectionMethodsToWire?: readonly Extract<keyof TProjection, string>[]
): TProjection {
	if (!parentPort)
		throw new Error('createWorkerInstance can only be called from a Worker thread');
	if (!isWorkerData(workerData))
		throw new Error('workerData does not contain projectionPort and viewPort');

	const projection = isClass(ProjectionFactoryOrType) ? new ProjectionFactoryOrType() : ProjectionFactoryOrType();
	const methodsToWire = projectionMethodsToWire ?? getMessageHandlerNames(projection);
	const projectionApi = Object.fromEntries(
		methodsToWire.map(methodName => {
			const method = projection[methodName];
			assertFunction(method, methodName);

			return [methodName, method.bind(projection)];
		})
	);

	Comlink.expose(projectionApi, nodeEndpoint(workerData.projectionPort));
	Comlink.expose(projection.view, nodeEndpoint(workerData.viewPort));

	parentPort.postMessage({ type: 'ready' } satisfies WorkerInitMessage);

	return projection;
}
