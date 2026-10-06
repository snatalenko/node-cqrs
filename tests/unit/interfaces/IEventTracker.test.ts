import { isEventLocker, isEventTracker } from '../../../src/interfaces/index.ts';

const eventLocker = {
	getLastEvent: () => undefined,
	tryMarkAsProjecting: () => true,
	markAsProjected: () => { },
	markAsLastEvent: () => { }
};

const eventTracker = {
	...eventLocker,
	waitFor: async () => { }
};

describe('isEventTracker', () => {

	it('returns true for objects implementing IEventTracker', () => {
		expect(isEventTracker(eventTracker)).toBe(true);
	});

	it('returns false for event lockers without waitFor', () => {
		expect(isEventTracker(eventLocker)).toBe(false);
	});

	it('returns false when any of event locking methods is missing', () => {
		const { markAsLastEvent, ...incomplete } = eventTracker;

		expect(isEventTracker(incomplete)).toBe(false);
	});

	it('returns false for non-objects', () => {
		expect(isEventTracker(undefined)).toBe(false);
		expect(isEventTracker(null)).toBe(false);
		expect(isEventTracker('tracker')).toBe(false);
	});

	it('detects methods on function-based proxies', () => {
		const proxy = new Proxy(function () { }, { get: () => () => { } });

		expect(isEventTracker(proxy)).toBe(true);
	});
});

describe('isEventLocker', () => {

	it('returns true for objects implementing event locking methods, with or without waitFor', () => {
		expect(isEventLocker(eventLocker)).toBe(true);
		expect(isEventLocker(eventTracker)).toBe(true);
	});

	it('returns false when any of event locking methods is missing', () => {
		const { markAsLastEvent, ...incomplete } = eventLocker;

		expect(isEventLocker(incomplete)).toBe(false);
	});
});
