'use strict';

const { InMemoryEventStorage } = require('../..');
const { expect } = require('chai');
const readEventsFromIterator = require('../../src/utils/readEventsFromIterator');

describe('InMemoryEventStorage', () => {

	/** @type {InMemoryEventStorage} */
	let storage;

	beforeEach(() => {
		storage = new InMemoryEventStorage();
	});

	describe('getNewId', () => {

		it('generates unique numbers', () => {

			const n1 = storage.getNewId();
			const n2 = storage.getNewId();

			expect(n1).to.be.a('Number');
			expect(n2).to.not.eq(n1);
		});
	});

	describe('commit', () => {

		it('attaches events to a stream', async () => {

			await storage.commit(1, [{
				type: 'somethingHappened'
			}]);

			const events = await readEventsFromIterator(storage.getStream(1));

			expect(events).to.eql([{
				type: 'somethingHappened'
			}]);
		});

		it('returns a list of events committed for the first time', async () => {

			const newEvents1 = await storage.commit(1, [
				{ type: 'somethingHappened1' },
				{ type: 'somethingHappened2' },
				{ id: 'e3', type: 'somethingHappened3' },
				{ id: 'e4', type: 'somethingHappened4' }
			]);

			expect(newEvents1).to.eql([
				{ type: 'somethingHappened1' },
				{ type: 'somethingHappened2' },
				{ id: 'e3', type: 'somethingHappened3' },
				{ id: 'e4', type: 'somethingHappened4' }
			]);

			const newEvents2 = await storage.commit(1, [
				{ type: 'somethingHappened2' },
				{ type: 'somethingHappened3' },
				{ id: 'e3', type: '' },
				{ id: 'e5', type: 'somethingHappened5' }
			]);

			expect(newEvents2).to.eql([
				{ type: 'somethingHappened3' },
				{ id: 'e5', type: 'somethingHappened5' }
			]);
		});
	});

	describe('getStream', () => {

		beforeEach(async () => {
			await storage.commit(1, [
				{ id: 'e0', type: '' },
				{ id: 'e1', type: '' }
			]);
			await storage.commit(2, [{ id: 'e2', type: '' }]);
			await storage.commit(1, [{ id: 'e3', type: '' }]);
		});

		it('returns an async iterator', () => {

			const iterableStream = storage.getStream(1);

			expect(iterableStream).to.have.property(Symbol.asyncIterator);
		});

		it('returns events committed to a stream with given ID', async () => {

			const events = await readEventsFromIterator(storage.getStream(1));

			expect(events).to.eql([
				{ id: 'e0', type: '' },
				{ id: 'e1', type: '' },
				{ id: 'e3', type: '' }
			]);
		});

		it('returns events committed after specified `afterEvent`', async () => {

			const events = await readEventsFromIterator(storage.getStream(1, {
				afterEvent: { id: 'e0', type: '' }
			}));

			expect(events).to.eql([
				{ id: 'e1', type: '' },
				{ id: 'e3', type: '' }
			]);
		});

		it('returns events committed before specified `beforeEvent`', async () => {

			const events = await readEventsFromIterator(storage.getStream(1, {
				beforeEvent: { id: 'e3', type: '' }
			}));

			expect(events).to.eql([
				{ id: 'e0', type: '' },
				{ id: 'e1', type: '' }
			]);
		});

		it('returns events committed between `afterEvent` and `beforeEvent`', async () => {

			const events = await readEventsFromIterator(storage.getStream(1, {
				afterEvent: { id: 'e0', type: '' },
				beforeEvent: { id: 'e3', type: '' }
			}));

			expect(events).to.eql([
				{ id: 'e1', type: '' }
			]);
		});

		it('ignores filter when specified events do not exist', async () => {

			const events = await readEventsFromIterator(storage.getStream(1, {
				afterEvent: { id: 'e-unknown', type: '' },
				beforeEvent: { id: 'e-unknown', type: '' }
			}));

			expect(events).to.eql([
				{ id: 'e0', type: '' },
				{ id: 'e1', type: '' },
				{ id: 'e3', type: '' }
			]);
		});

		it('returns blank array when stream does not exist', async () => {

			const events = await readEventsFromIterator(storage.getStream(3));
			expect(events).to.eql([]);
		});
	});

	describe('getEventsByTypes', () => {

		beforeEach(async () => {
			storage.commit(1, [{ type: 'a' }]);
			storage.commit(2, [{ type: 'b' }]);
			storage.commit(3, [{ type: 'c' }]);
		});

		it('returns async iterator', () => {

			const iterableStream = storage.getEventsByTypes(['a']);

			expect(iterableStream).to.have.property(Symbol.asyncIterator);
		});

		it('returns events by specific types', async () => {

			const events = await readEventsFromIterator(storage.getEventsByTypes(['a', 'b']));

			expect(events).to.eql([
				{ type: 'a' },
				{ type: 'b' }
			]);
		});

		it('applies `afterEvent`/`beforeEvent` filter', async () => {

			const events = await readEventsFromIterator(storage.getEventsByTypes(['a', 'b', 'c'], {
				afterEvent: { type: 'a' },
				beforeEvent: { type: 'c' }
			}));

			expect(events).to.eql([
				{ type: 'b' }
			]);
		});
	});
});
