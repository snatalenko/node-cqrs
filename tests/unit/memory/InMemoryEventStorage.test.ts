import { expect } from 'chai';
import { InMemoryEventStorage } from '../../../src';

describe('InMemoryEventStorage', () => {
	let storage;

	beforeEach(() => {
		storage = new InMemoryEventStorage();
	});

	describe('commitEvents', () => {
		it('commits events and returns them', async () => {
			const events = [
				{ id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' }
			];
			const result = await storage.commitEvents(events);
			expect(result).to.deep.equal(events);
		});
	});

	describe('getAggregateEvents', () => {

		it('yields events with matching aggregateId', async () => {

			const event1 = { id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: '2', aggregateId: 'agg2', aggregateVersion: 1, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('agg1')) {
				results.push(event);
			}
			expect(results).to.deep.equal([event1]);
		});

		it('yields events with aggregateVersion greater than snapshot.aggregateVersion', async () => {

			const event1 = { id: '1', aggregateId: 'agg1', aggregateVersion: 1, type: 'TestEvent' };
			const event2 = { id: '2', aggregateId: 'agg1', aggregateVersion: 2, type: 'TestEvent' };
			await storage.commitEvents([event1, event2]);

			const snapshot = { aggregateVersion: 1 };
			const results = [];
			for await (const event of storage.getAggregateEvents('agg1', { snapshot })) {
				results.push(event);
			}
			expect(results).to.deep.equal([event2]);
		});
	});

	describe('getSagaEvents', () => {

		it('yields saga events with sagaVersion less than beforeEvent.sagaVersion', async () => {

			const event1 = { id: '1', sagaId: 'saga1', sagaVersion: 1, type: 'SagaEvent' };
			const event2 = { id: '2', sagaId: 'saga1', sagaVersion: 2, type: 'SagaEvent' };
			const event3 = { id: '3', sagaId: 'saga1', sagaVersion: 3, type: 'SagaEvent' };
			await storage.commitEvents([event1, event2, event3]);

			const beforeEvent = { sagaVersion: 3 };
			const results = [];
			for await (const event of storage.getSagaEvents('saga1', { beforeEvent })) {
				results.push(event);
			}
			expect(results).to.deep.equal([event1, event2]);
		});
	});

	describe('getEventsByTypes', () => {

		it('yields events matching the provided types', async () => {

			const event1 = { id: '1', type: 'A' };
			const event2 = { id: '2', type: 'B' };
			const event3 = { id: '3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A'])) {
				results.push(event);
			}
			expect(results).to.deep.equal([event1, event3]);
		});

		it('yields events only after the given afterEvent id', async () => {

			const event1 = { id: '1', type: 'A' };
			const event2 = { id: '2', type: 'A' };
			const event3 = { id: '3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const options = { afterEvent: { id: '1' } };
			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], options)) {
				results.push(event);
			}
			expect(results).to.deep.equal([event2, event3]);
		});

		it('throws error if afterEvent is provided without id', async () => {

			const event1 = { id: '1', type: 'A' };
			await storage.commitEvents([event1]);
			const options = { afterEvent: {} };

			const gen = storage.getEventsByTypes(['A'], options);
			try {
				await gen.next();
				throw new Error('Expected error was not thrown');
			} catch (err) {
				expect(err).to.be.instanceOf(TypeError);
				expect(err.message).to.equal('options.afterEvent.id is required');
			}
		});
	});

	describe('getNewId', () => {

		it('returns sequential string ids', () => {

			const id1 = storage.getNewId();
			const id2 = storage.getNewId();
			expect(id1).to.equal('1');
			expect(id2).to.equal('2');
		});
	});
});
