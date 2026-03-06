import { isEventBus } from '../../../src/interfaces/IEventBus.ts';

describe('isEventBus', () => {
	it('returns true for observable object with publish()', () => {
		const bus = {
			on() { },
			off() { },
			publish: async () => []
		};

		expect(isEventBus(bus)).toBe(true);
	});

	it('returns false for non-eventBus objects', () => {
		expect(isEventBus({ on() { }, off() { } })).toBe(false);
		expect(isEventBus(null)).toBe(false);
	});
});
