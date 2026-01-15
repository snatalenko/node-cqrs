import { isMainThread, parentPort } from 'node:worker_threads';

import type { SerializedError, WorkerInitMessage, WorkerOutboundMessage } from './protocol';

function serializeError(err: unknown): SerializedError {
	if (err instanceof Error) {
		return {
			name: err.name,
			message: err.message,
			stack: err.stack
		};
	}

	return {
		name: 'Error',
		message: typeof err === 'string' ? err : 'Unknown error',
		details: err
	};
}

/**
 * Exposes the given projection constructor as a worker projection.
 *
 * Intended usage: call this at the bottom of the derived projection module so that
 * the projection implementation file can be used as the Worker entrypoint.
 */
export function exposeWorkerProjection<T>(ProjectionCtor: new (...args: any[]) => T) {
	if (isMainThread)
		return;
	if (!parentPort)
		throw new Error('exposeWorkerProjection must be called inside a Worker thread');

	let projectionInstance: T;

	parentPort.on('message', async (message: WorkerInitMessage) => {
		if (message?.kind !== 'init')
			return;
		if (projectionInstance)
			return;

		try {
			projectionInstance = new ProjectionCtor();

			const outbound: WorkerOutboundMessage = { kind: 'ready' };
			parentPort!.postMessage(outbound);
		}
		catch (err) {
			const outbound: WorkerOutboundMessage = { kind: 'init.error', error: serializeError(err) };
			parentPort!.postMessage(outbound);
			setImmediate(() => process.exit(1));
		}
	});
}
