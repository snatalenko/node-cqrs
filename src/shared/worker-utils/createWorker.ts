import { Worker, type Transferable } from 'node:worker_threads';
import * as path from 'node:path';

/**
 * Create a worker instance and await a first message (or a specific ready message) or a failure.
 *
 * @param workerEntrypoint - Absolute path or URL to the worker module
 * @param workerData - Structured-cloneable data passed to the worker via workerData
 * @param options.transferList - Transferable objects to move (not copy) into the worker
 * @param options.isReadyMessage - Predicate to identify the ready message; if omitted, any first message resolves
 * @returns Resolved Worker instance after the ready handshake
 */
export async function createWorker(
	workerEntrypoint: string | URL,
	workerData: unknown,
	options?: {
		readonly transferList?: Transferable[];
		readonly isReadyMessage?: (msg: unknown) => boolean;
	}
): Promise<Worker> {

	const resolvedEntrypoint = workerEntrypoint instanceof URL ?
		workerEntrypoint :
		path.resolve(workerEntrypoint);

	const worker = new Worker(resolvedEntrypoint, {
		workerData,
		transferList: options?.transferList
	});

	await new Promise<void>((resolve, reject) => {

		const cleanup = () => {
			// eslint-disable-next-line no-use-before-define
			worker.off('error', onError);
			// eslint-disable-next-line no-use-before-define
			worker.off('message', onMessage);
			// eslint-disable-next-line no-use-before-define
			worker.off('exit', onExit);
		};

		const onMessage = (msg: unknown) => {
			if (options?.isReadyMessage && !options.isReadyMessage(msg))
				return;

			cleanup();
			resolve();
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
