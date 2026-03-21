import { subscribe } from '../../../src/utils/subscribe.ts';

describe('subscribe', () => {
	it('derives handled message types from observer methods when static handles are not defined', () => {
		class ObserverWithoutHandles {
			somethingHappened() { }
		}

		const observable = {
			on: jest.fn(),
			off: jest.fn()
		};
		const observer = new ObserverWithoutHandles();

		subscribe(observable as any, observer);

		expect(observable.on).toHaveBeenCalled();
		expect(observable.on.mock.calls.some(call => call[0] === 'somethingHappened')).toBe(true);
	});

	it('throws when queueName is provided and observable does not support queue()', () => {
		class ObserverWithoutHandles {
			somethingHappened() { }
		}

		const observable = {
			on: jest.fn(),
			off: jest.fn()
		};
		const observer = new ObserverWithoutHandles();

		expect(() => subscribe(observable as any, observer, { queueName: 'q1' }))
			.toThrow('Observer does not support named queues');
	});
});
