import { nextCycle } from '../../../src/in-memory/utils/nextCycle.ts';

describe('nextCycle', () => {

	it('uses setImmediate in Node.js environment', async () => {
		const order: string[] = [];

		const result = nextCycle().then(() => order.push('nextCycle'));
		const competitor = new Promise<void>(rs => setImmediate(() => {
			order.push('setImmediate');
			rs();
		}));

		await Promise.all([result, competitor]);

		expect(order).toEqual(['nextCycle', 'setImmediate']);
	});

	it('falls back to setTimeout when setImmediate is not available', async () => {
		const originalSetImmediate = globalThis.setImmediate;

		// @ts-expect-error
		delete globalThis.setImmediate;

		try {
			const spy = jest.spyOn(globalThis, 'setTimeout');

			let nextCycleFallback!: typeof nextCycle;
			await jest.isolateModulesAsync(async () => {
				({ nextCycle: nextCycleFallback } = await import('../../../src/in-memory/utils/nextCycle.ts'));
			});

			await nextCycleFallback();

			expect(spy).toHaveBeenCalled();
			spy.mockRestore();
		}
		finally {
			globalThis.setImmediate = originalSetImmediate;
		}
	});
});
