import { InMemoryEventTracker } from '../../../src/in-memory/InMemoryEventTracker.ts';

describe('InMemoryEventTracker', () => {

	let tracker: InMemoryEventTracker;
	const event = { id: 'e1', type: 'somethingHappened' };

	beforeEach(() => {
		tracker = new InMemoryEventTracker({ historySize: 2 });
	});

	describe('tryMarkAsProjecting', () => {

		it('allows projecting a new event', () => {
			expect(tracker.tryMarkAsProjecting(event)).toBe(true);
		});

		it('refuses an event being projected', () => {
			tracker.tryMarkAsProjecting(event);
			expect(tracker.tryMarkAsProjecting(event)).toBe(false);
		});

		it('refuses a projected event', () => {
			tracker.tryMarkAsProjecting(event);
			tracker.markAsProjected(event);
			expect(tracker.tryMarkAsProjecting(event)).toBe(false);
		});

		it('allows an event again after its projection failed', () => {
			tracker.tryMarkAsProjecting(event);
			tracker.markAsFailed(event, new Error('failed'));
			expect(tracker.tryMarkAsProjecting(event)).toBe(true);
		});

		it('allows an event again when it fails after being marked as projected', () => {
			tracker.tryMarkAsProjecting(event);
			tracker.markAsProjected(event);
			tracker.markAsFailed(event, new Error('commit failed'));
			expect(tracker.tryMarkAsProjecting(event)).toBe(true);
		});

		it('allows an event again once it leaves the history', () => {
			for (const id of ['e1', 'e2', 'e3']) {
				tracker.tryMarkAsProjecting({ ...event, id });
				tracker.markAsProjected({ ...event, id });
			}

			expect(tracker.tryMarkAsProjecting({ ...event, id: 'e1' })).toBe(true);
			expect(tracker.tryMarkAsProjecting({ ...event, id: 'e3' })).toBe(false);
		});

		it('always allows events without id', () => {
			const withoutId = { type: 'somethingHappened' };
			tracker.tryMarkAsProjecting(withoutId);
			tracker.markAsProjected(withoutId);
			expect(tracker.tryMarkAsProjecting(withoutId)).toBe(true);
		});

		it('compares event ids as strings', () => {
			tracker.tryMarkAsProjecting({ ...event, id: 1 });
			expect(tracker.tryMarkAsProjecting({ ...event, id: '1' })).toBe(false);
		});
	});

	describe('waitFor', () => {

		it('resolves once the event is projected', async () => {
			const waiting = tracker.waitFor('e1', { timeout: 1_000 });
			tracker.markAsProjected(event);
			await expect(waiting).resolves.toBeUndefined();
		});

		it('resolves immediately for a recently projected event', async () => {
			tracker.markAsProjected(event);
			await expect(tracker.waitFor('e1', { timeout: 1_000 })).resolves.toBeUndefined();
		});

		it('rejects when the projection fails', async () => {
			const waiting = tracker.waitFor('e1', { timeout: 1_000 });
			tracker.markAsFailed(event, new Error('failed'));
			await expect(waiting).rejects.toThrow('failed');
		});
	});

	it('restores views from all events', () => {
		tracker.markAsLastEvent();
		expect(tracker.getLastEvent()).toBeUndefined();
	});

	it('validates the history size', () => {
		expect(() => new InMemoryEventTracker({ historySize: -1 })).toThrow();
	});
});
