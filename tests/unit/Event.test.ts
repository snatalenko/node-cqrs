import { describe as describeEvent, describeMultiple } from '../../src/Event';

describe('Event', () => {
	it('describe(event) formats event details', () => {
		const event = {
			type: 'userCreated',
			aggregateId: 'user-1',
			aggregateVersion: 2
		};

		expect(describeEvent(event as any)).toBe('\'userCreated\' of user-1 (v2)');
	});

	it('describeMultiple(events) returns single event description for one event', () => {
		const event = {
			type: 'userCreated',
			aggregateId: 'user-1',
			aggregateVersion: 2
		};

		expect(describeMultiple([event] as any)).toBe(describeEvent(event as any));
	});

	it('describeMultiple(events) returns count for multiple events', () => {
		const event = {
			type: 'userCreated',
			aggregateId: 'user-1',
			aggregateVersion: 2
		};

		expect(describeMultiple([event, event] as any)).toBe('2 events');
	});
});
