/**
 * @returns Promise that resolves on next event loop cycle
 */
export const nextCycle = (): Promise<void> => new Promise(rs => setTimeout(rs, 0));
