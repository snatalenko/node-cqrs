import type { Worker } from 'node:worker_threads';
import { createWorker as createWorkerGeneric } from '../../shared/worker-utils/index.ts';
import type { IWorkerData } from '../protocol.ts';

/**
 * Create a worker instance for a projection worker module, await a handshake or a failure.
 *
 * @param workerModulePath - Absolute or relative path to the worker module
 * @param ports - MessagePorts for projection and view communication (transferred into the worker)
 * @returns Resolved Worker instance after the ready handshake
 */
export async function createWorker(workerModulePath: string, ports: IWorkerData): Promise<Worker> {
	return createWorkerGeneric(workerModulePath, ports, {
		transferList: [ports.projectionPort, ports.viewPort],
		isReadyMessage: m => (m as any)?.type === 'ready'
	});
}
