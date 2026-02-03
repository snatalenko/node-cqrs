import { Deferred } from '../../../src/utils/Deferred.ts';

describe('Deferred', () => {

	it('tracks resolve state', async () => {
		const d = new Deferred<number>();
		expect(d.settled).toBe(false);
		expect(d.resolved).toBe(false);
		expect(d.rejected).toBe(false);

		d.resolve(42);

		expect(d.resolved).toBe(true);
		expect(d.rejected).toBe(false);
		expect(d.settled).toBe(true);
		await expect(d.promise).resolves.toBe(42);
	});

	it('tracks reject state', async () => {
		const d = new Deferred<number>();

		d.reject(new Error('nope'));

		expect(d.resolved).toBe(false);
		expect(d.rejected).toBe(true);
		expect(d.settled).toBe(true);
		await expect(d.promise).rejects.toThrow('nope');
	});
});

