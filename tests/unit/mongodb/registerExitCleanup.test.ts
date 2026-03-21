import { EventEmitter } from 'events';
import { registerExitCleanup } from '../../../src/mongodb/registerExitCleanup.ts';

describe('registerExitCleanup', () => {

	it('registers handlers for SIGINT and SIGTERM', () => {
		const process = new EventEmitter();
		const onceSpy = jest.spyOn(process, 'once');

		registerExitCleanup(process as any, jest.fn());

		expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
		expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
	});

	it('runs cleanup and removes listeners when a signal is received', async () => {
		const process = new EventEmitter();
		const offSpy = jest.spyOn(process, 'off');
		const cleanup = jest.fn().mockResolvedValue(undefined);

		registerExitCleanup(process as any, cleanup);

		process.emit('SIGINT');
		await Promise.resolve();

		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
		expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
	});

	it('dispose removes listeners without running cleanup', () => {
		const process = new EventEmitter();
		const offSpy = jest.spyOn(process, 'off');
		const cleanup = jest.fn();

		const subscription = registerExitCleanup(process as any, cleanup);
		subscription.dispose();

		expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
		expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

		process.emit('SIGTERM');
		expect(cleanup).not.toHaveBeenCalled();
	});

	it('supports undefined process', async () => {
		const cleanup = jest.fn().mockResolvedValue(undefined);

		const subscription = registerExitCleanup(undefined, cleanup);
		expect(subscription).toEqual({ dispose: expect.any(Function) });

		subscription.dispose();
		expect(cleanup).not.toHaveBeenCalled();
	});
});
