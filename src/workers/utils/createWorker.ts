import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import { isWorkerInitMessage, type IWorkerData } from '../protocol';

/**
 * Create a worker instance, await a handshake or a failure
 *
 * @param workerModulePath - Path to worker module
 * @param ports - Container with MessagePorts for communication with worker projection and view instances
 * @returns Worker instance
 */
export async function createWorker(workerModulePath: string, ports: IWorkerData) {

	const workerEntrypoint = path.isAbsolute(workerModulePath) ?
		workerModulePath :
		path.resolve(process.cwd(), workerModulePath);

	const worker = new Worker(workerEntrypoint, {
		workerData: ports,
		transferList: [
			ports.projectionPort,
			ports.viewPort
		]
	});

	await new Promise((resolve, reject) => {

		const cleanup = () => {
			// eslint-disable-next-line no-use-before-define
			worker.off('error', onError);
			// eslint-disable-next-line no-use-before-define
			worker.off('message', onMessage);
			// eslint-disable-next-line no-use-before-define
			worker.off('exit', onExit);
		};

		const onMessage = (msg: unknown) => {
			if (!isWorkerInitMessage(msg))
				return;

			cleanup();
			resolve(undefined);
		};

		const onError = (err: unknown) => {
			cleanup();
			reject(err);
		};

		const onExit = (exitCode: number) => {
			cleanup();
			reject(new Error(`Worker exited prematurely with exit code ${exitCode}`));
		};

		worker.on('message', onMessage);
		worker.once('error', onError);
		worker.once('exit', onExit);
	});

	return worker;
}
