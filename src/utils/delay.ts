/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * The internal timeout is unref'd to avoid blocking Node.js process termination.
 */
export const delay = (ms: number) => new Promise<void>(resolve => {
	const t = setTimeout(resolve, ms);
	t.unref();
});
