import { Worker } from 'node:worker_threads';
import {
	isSqliteWorkerReadyMessage,
	type SqliteWorkerData,
	type SqliteWorkerProxyParams
} from '../protocol.ts';
import { assertString, assertStringArray } from '../../utils/assert.ts';

type CreateSqliteWorkerParams = SqliteWorkerProxyParams & {
	sqliteWorkerRunnerLocation: string | URL;
};

export async function createSqliteWorker({
	sqliteWorkerRunnerLocation,
	dbLocation: location,
	pragmas
}: CreateSqliteWorkerParams): Promise<Worker> {
	assertString(location, 'location');
	if (pragmas?.length)
		assertStringArray(pragmas, 'pragmas');
	assertString(sqliteWorkerRunnerLocation, 'sqliteWorkerRunnerLocation');

	const workerData: SqliteWorkerData = { db: { location, pragmas } };
	const worker = new Worker(sqliteWorkerRunnerLocation, { workerData });

	await new Promise<void>((resolve, reject) => {
		let onError: (err: unknown) => void;
		let onMessage: (message: unknown) => void;
		let onExit: (exitCode: number) => void;

		const cleanup = () => {
			worker.off('error', onError);
			worker.off('message', onMessage);
			worker.off('exit', onExit);
		};

		onMessage = (message: unknown) => {
			if (!isSqliteWorkerReadyMessage(message))
				return;

			cleanup();
			resolve();
		};

		onError = (err: unknown) => {
			cleanup();
			reject(err);
		};

		onExit = (exitCode: number) => {
			cleanup();
			reject(new Error(`SQLite worker exited prematurely with exit code ${exitCode}`));
		};

		worker.on('message', onMessage);
		worker.once('error', onError);
		worker.once('exit', onExit);
	});

	return worker;
}
