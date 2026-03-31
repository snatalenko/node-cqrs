import { nextCycle } from '../../../src/in-memory/utils/nextCycle.ts';

describe('nextCycle', () => {

	it('uses setImmediate in Node.js environment', async () => {
		const order: string[] = [];

		const result = nextCycle().then(() => order.push('nextCycle'));
		const competitor = new Promise<void>(rs => setImmediate(() => { order.push('setImmediate'); rs(); }));

		await Promise.all([result, competitor]);

		expect(order).toEqual(['nextCycle', 'setImmediate']);
	});
});
