/**
 * Executes a callback with a value that may be provided synchronously or as a Promise.
 *
 * @returns the callback result directly when the input is synchronous,
 *   or a Promise of the result when the input is a Promise.
 */
export const promiseOrSync = <T, R>(
	r: Promise<T> | T,
	processCb: (result: T) => R | Promise<R>,
	cleanupCb?: () => void
): R | Promise<R> => {
	if (r instanceof Promise)
		return r.then(processCb).finally(cleanupCb);

	try {
		return processCb(r);
	}
	finally {
		cleanupCb?.();
	}
};
