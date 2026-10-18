import { type IEventFeed, isEventFeed } from '../../../src/interfaces/IEventFeed.ts';

describe('isEventFeed', () => {
	it('returns true for an object with startEventFeed() and stopEventFeed()', () => {
		const feed: IEventFeed = {
			startEventFeed() { },
			stopEventFeed() { }
		};

		expect(isEventFeed(feed)).toBe(true);
	});

	it('recognizes class instances implementing IEventFeed', () => {
		class Feed implements IEventFeed {
			startEventFeed() { }
			stopEventFeed() { }
		}

		expect(isEventFeed(new Feed())).toBe(true);
	});

	it('returns false for objects with generic start() and stop() only', () => {
		expect(isEventFeed({ start() { }, stop() { } })).toBe(false);
	});

	it('returns false when a lifecycle method is missing or not a function', () => {
		expect(isEventFeed({ startEventFeed() { } })).toBe(false);
		expect(isEventFeed({ stopEventFeed() { } })).toBe(false);
		expect(isEventFeed({ startEventFeed: true, stopEventFeed() { } })).toBe(false);
	});

	it('returns false for non-objects', () => {
		expect(isEventFeed(null)).toBe(false);
		expect(isEventFeed(undefined)).toBe(false);
		expect(isEventFeed(() => { })).toBe(false);
	});
});
