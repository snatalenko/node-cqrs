import { fileURLToPath } from 'node:url';

/** @internal */
export function resolveCurrentFileLocationFromStack(stack = new Error().stack) {
	const stackFilename = stack?.match(/\((file:\/\/[^)]+SqliteWorkerRunner\.js):\d+:\d+\)/)?.[1];
	if (!stackFilename)
		throw new Error('Worker location could not be resolved from Error stack, pass sqliteWorkerRunnerLocation');

	return fileURLToPath(stackFilename);
}
