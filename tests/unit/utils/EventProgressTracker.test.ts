import { EventProgressTracker, TimeoutError, type IEvent } from '../../../src';

const event = (id: any): IEvent => ({ id, type: 'somethingHappened' });

/** Resolves to the promise state without waiting for it to settle */
const getState = (promise: Promise<unknown>): Promise<'pending' | 'resolved' | 'rejected'> =>
	Promise.race([
		promise.then(() => 'resolved' as const, () => 'rejected' as const),
		new Promise<'pending'>(resolve => setImmediate(() => resolve('pending')))
	]);

describe('EventProgressTracker', () => {

	let tracker: EventProgressTracker;

	beforeEach(() => {
		// no default timeout, so that waits left pending by tests do not keep timers running
		tracker = new EventProgressTracker({ timeout: 0 });
	});

	describe('constructor', () => {

		it('validates options', () => {
			expect(() => new EventProgressTracker({ timeout: -1 })).toThrow(TypeError);
			expect(() => new EventProgressTracker({ historySize: 1.5 })).toThrow(TypeError);
		});
	});

	describe('waitFor', () => {

		it('resolves once the event is marked as completed', async () => {
			const waiting = tracker.waitFor('e1');
			expect(await getState(waiting)).toBe('pending');

			tracker.markAsCompleted(event('e1'));

			expect(await getState(waiting)).toBe('resolved');
		});

		it('resolves immediately for events completed earlier', async () => {
			tracker.markAsCompleted(event('e1'));

			await expect(tracker.waitFor('e1')).resolves.toBeUndefined();
		});

		it('resolves once all of the given events are completed', async () => {
			const waiting = tracker.waitFor(['e1', 'e2']);

			tracker.markAsCompleted(event('e1'));
			expect(await getState(waiting)).toBe('pending');

			tracker.markAsCompleted(event('e2'));
			expect(await getState(waiting)).toBe('resolved');
		});

		it('resolves immediately for an empty list of IDs', async () => {
			await expect(tracker.waitFor([])).resolves.toBeUndefined();
		});

		it('matches numeric and object identifiers by their string representation', async () => {
			const objectId = { toString: () => 'obj-1' };
			const waiting = tracker.waitFor([1, objectId]);

			tracker.markAsCompleted(event('1'));
			tracker.markAsCompleted(event('obj-1'));

			await expect(waiting).resolves.toBeUndefined();
		});

		it('resolves concurrent waiters of the same event', async () => {
			const first = tracker.waitFor('e1');
			const second = tracker.waitFor(['e1', 'e2']);

			tracker.markAsCompleted(event('e1'));

			expect(await getState(first)).toBe('resolved');
			expect(await getState(second)).toBe('pending');
		});

		it('rejects when projection of any of the events fails', async () => {
			const error = new Error('projection failed');
			const waiting = tracker.waitFor(['e1', 'e2']);

			tracker.markAsFailed(event('e2'), error);

			await expect(waiting).rejects.toBe(error);
		});

		it('does not affect waiters of other events on failure', async () => {
			const unrelated = tracker.waitFor('e2');

			tracker.markAsFailed(event('e1'), new Error('projection failed'));

			expect(await getState(unrelated)).toBe('pending');
		});

		it('does not retain failures, allowing to await redelivered events', async () => {
			tracker.markAsFailed(event('e1'), new Error('projection failed'));

			const waiting = tracker.waitFor('e1');
			expect(await getState(waiting)).toBe('pending');

			tracker.markAsCompleted(event('e1'));
			expect(await getState(waiting)).toBe('resolved');
		});

		it('rejects with TimeoutError when events are not completed in time', async () => {
			await expect(tracker.waitFor('e1', { timeout: 10 })).rejects.toThrow(TimeoutError);
		});

		it('uses the default timeout configured in constructor', async () => {
			tracker = new EventProgressTracker({ timeout: 10 });

			await expect(tracker.waitFor('e1')).rejects.toThrow('Timed out after 10 ms');
		});

		it('does not time out when timeout is 0', async () => {
			tracker = new EventProgressTracker({ timeout: 10 });
			const waiting = tracker.waitFor('e1', { timeout: 0 });

			await new Promise(resolve => setTimeout(resolve, 20));
			expect(await getState(waiting)).toBe('pending');

			tracker.markAsCompleted(event('e1'));
			expect(await getState(waiting)).toBe('resolved');
		});

		it('rejects with abort reason when the signal is aborted', async () => {
			const controller = new AbortController();
			const reason = new Error('request cancelled');
			const waiting = tracker.waitFor('e1', { signal: controller.signal });

			controller.abort(reason);

			await expect(waiting).rejects.toBe(reason);
		});

		it('rejects immediately when the signal is already aborted', async () => {
			const reason = new Error('request cancelled');

			await expect(tracker.waitFor('e1', { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
		});

		it('stops tracking waiters once settled', async () => {
			const controller = new AbortController();
			const aborted = tracker.waitFor('e1', { signal: controller.signal });
			controller.abort();
			await expect(aborted).rejects.toBeDefined();

			const failure = new Error('projection failed');
			const waiting = tracker.waitFor('e1');
			tracker.markAsFailed(event('e1'), failure);

			await expect(waiting).rejects.toBe(failure);
		});

		it('waits again for events evicted from the history', async () => {
			tracker = new EventProgressTracker({ historySize: 1 });
			tracker.markAsCompleted(event('e1'));
			tracker.markAsCompleted(event('e2'));

			await expect(tracker.waitFor('e2')).resolves.toBeUndefined();
			expect(await getState(tracker.waitFor('e1', { timeout: 0 }))).toBe('pending');
		});

		it('validates arguments', async () => {
			await expect(tracker.waitFor(undefined as any)).rejects.toThrow(TypeError);
			await expect(tracker.waitFor(['e1', ''])).rejects.toThrow(TypeError);
			await expect(tracker.waitFor('e1', { timeout: -1 })).rejects.toThrow(TypeError);
		});
	});

	describe('projectedEventIdsProvider', () => {

		let projected: Set<string>;
		let projectedEventIdsProvider: jest.Mock;

		beforeEach(() => {
			projected = new Set();
			projectedEventIdsProvider = jest.fn(async (eventIds: any[]) =>
				eventIds.filter(id => projected.has(String(id))));
			tracker = new EventProgressTracker({
				timeout: 0,
				projectedEventIdsProvider,
				pollInterval: 5,
				maxPollInterval: 5
			});
		});

		it('can be passed to constructor instead of options', async () => {
			tracker = new EventProgressTracker(projectedEventIdsProvider);
			projected.add('e1');

			await expect(tracker.waitFor('e1')).resolves.toBeUndefined();
			expect(projectedEventIdsProvider).toHaveBeenCalledWith(['e1']);
		});

		it('resolves for events found projected once the wait is registered', async () => {
			projected.add('e1');

			await expect(tracker.waitFor('e1')).resolves.toBeUndefined();
			expect(projectedEventIdsProvider).toHaveBeenCalledWith(['e1']);
		});

		it('polls until events are projected by another process', async () => {
			const waiting = tracker.waitFor(['e1', 'e2']);

			projected.add('e1');
			await new Promise(resolve => setTimeout(resolve, 20));
			expect(await getState(waiting)).toBe('pending');

			projected.add('e2');
			await expect(waiting).resolves.toBeUndefined();
		});

		it('passes original identifiers to the lookup', async () => {
			projected.add('42');

			await tracker.waitFor(42);

			expect(projectedEventIdsProvider).toHaveBeenCalledWith([42]);
		});

		it('looks up pending events of all waiters in a single poll', async () => {
			const first = tracker.waitFor('e1');
			const second = tracker.waitFor('e2');
			projectedEventIdsProvider.mockClear();

			await new Promise(resolve => setTimeout(resolve, 10));

			expect(projectedEventIdsProvider).toHaveBeenCalledWith(['e1', 'e2']);

			projected.add('e1').add('e2');
			await Promise.all([first, second]);
		});

		it('stops polling once there are no pending waits', async () => {
			projected.add('e1');
			await tracker.waitFor('e1');
			projectedEventIdsProvider.mockClear();

			await new Promise(resolve => setTimeout(resolve, 20));

			expect(projectedEventIdsProvider).not.toHaveBeenCalled();
		});

		it('retries the lookup after errors, without rejecting the wait', async () => {
			projectedEventIdsProvider
				.mockRejectedValueOnce(new Error('connection lost'))
				.mockRejectedValueOnce(new Error('connection lost'));
			projected.add('e1');

			await expect(tracker.waitFor('e1')).resolves.toBeUndefined();
			expect(projectedEventIdsProvider).toHaveBeenCalledTimes(3);
		});

		it('resolves events completed in the current process without waiting for the lookup', async () => {
			const waiting = tracker.waitFor('e1');

			tracker.markAsCompleted(event('e1'));

			expect(await getState(waiting)).toBe('resolved');
		});

		it('does not keep the history of completed events by default', async () => {
			const controller = new AbortController();
			tracker.markAsCompleted(event('e1'));

			const waiting = tracker.waitFor('e1', { signal: controller.signal });
			expect(await getState(waiting)).toBe('pending');

			controller.abort();
			await expect(waiting).rejects.toBeDefined();
		});

		it('keeps the history of completed events when historySize is set', async () => {
			tracker = new EventProgressTracker({ projectedEventIdsProvider, historySize: 10 });
			tracker.markAsCompleted(event('e1'));

			await expect(tracker.waitFor('e1')).resolves.toBeUndefined();
			expect(projectedEventIdsProvider).not.toHaveBeenCalled();
		});

		it('increases the polling interval up to maxPollInterval', async () => {
			jest.useFakeTimers();
			try {
				tracker = new EventProgressTracker({
					timeout: 0,
					projectedEventIdsProvider,
					pollInterval: 10,
					maxPollInterval: 40
				});
				const waiting = tracker.waitFor('e1');

				await jest.advanceTimersByTimeAsync(0);
				expect(projectedEventIdsProvider).toHaveBeenCalledTimes(1); // check on registration

				await jest.advanceTimersByTimeAsync(10);
				expect(projectedEventIdsProvider).toHaveBeenCalledTimes(2); // +10 ms

				await jest.advanceTimersByTimeAsync(20);
				expect(projectedEventIdsProvider).toHaveBeenCalledTimes(3); // +20 ms

				await jest.advanceTimersByTimeAsync(40);
				expect(projectedEventIdsProvider).toHaveBeenCalledTimes(4); // +40 ms

				await jest.advanceTimersByTimeAsync(40);
				expect(projectedEventIdsProvider).toHaveBeenCalledTimes(5); // +40 ms, capped

				projected.add('e1');
				await jest.advanceTimersByTimeAsync(40);
				await expect(waiting).resolves.toBeUndefined();
			}
			finally {
				jest.useRealTimers();
			}
		});

		it('validates polling options', () => {
			expect(() => new EventProgressTracker({ projectedEventIdsProvider: 'lookup' as any })).toThrow(TypeError);
			expect(() => new EventProgressTracker({ pollInterval: 0 })).toThrow(TypeError);
			expect(() => new EventProgressTracker({ maxPollInterval: -1 })).toThrow(TypeError);
		});
	});

	describe('markAsCompleted / markAsFailed', () => {

		it('ignore events without an id', () => {
			expect(() => tracker.markAsCompleted({ type: 'somethingHappened' })).not.toThrow();
			expect(() => tracker.markAsFailed({ type: 'somethingHappened' }, new Error())).not.toThrow();
		});

		it('throw when the argument is not an event', () => {
			expect(() => tracker.markAsCompleted(undefined as any)).toThrow('event must be a valid IEvent');
			expect(() => tracker.markAsCompleted({ id: 'e1' } as any)).toThrow('event must be a valid IEvent');
			expect(() => tracker.markAsFailed(null as any, new Error())).toThrow('event must be a valid IEvent');
			expect(() => tracker.markAsFailed('e1' as any, new Error())).toThrow('event must be a valid IEvent');
		});
	});
});
