/**
 * Registers cleanup handlers for SIGINT and SIGTERM signals on a Node.js process.
 * Executes the provided cleanup procedure when one of these signals is received,
 * then removes the listeners to allow the process to exit gracefully.
 *
 * @returns An object with a `dispose` method to manually remove the registered signal handlers.
 */
export const registerExitCleanup = (
	process: NodeJS.Process | undefined,
	cleanupProcedure: () => Promise<unknown> | unknown
) => {
	const handler = async () => {
		// remove listeners to allow the process to exit
		process?.off('SIGINT', handler);
		process?.off('SIGTERM', handler);

		await cleanupProcedure();
	};

	process?.once('SIGINT', handler);
	process?.once('SIGTERM', handler);

	return {
		dispose: () => {
			process?.off('SIGINT', handler);
			process?.off('SIGTERM', handler);
		}
	};
};
