const schedule = typeof setImmediate === 'function' ? setImmediate : (fn: () => void) => setTimeout(fn, 0);

/**
 * @returns Promise that resolves on next event loop cycle
 */
export const nextCycle = (): Promise<void> => new Promise(rs => schedule(rs));
