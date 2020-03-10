'use strict';

const { expect, assert, AssertionError } = require('chai');
const sinon = require('sinon');
const { AbstractAggregate } = require('../../src');
const blankContext = require('./mocks/blankContext');
const delay = ms => new Promise(rs => setTimeout(rs, ms));

class AggregateState {
	mutate(event) {
		this[event.type] = (this[event.type] || 0) + 1;
	}
}

class Aggregate extends AbstractAggregate {

	static get handles() {
		return ['doSomething', 'doSomethingWrong', 'doSomethingStateless'];
	}

	constructor({ id, state, events }) {
		super({ id, state: state || new AggregateState(), events });
	}

	async doSomething(payload) {
		await delay(100);
		this.emit('somethingDone', payload);
	}

	doSomethingWrong() {
		throw new Error('something went wrong');
	}

	doSomethingStateless(payload) {
		this.emit('somethingStatelessHappened', payload);
	}
}

class StatelessAggregate extends AbstractAggregate {
	static get handles() {
		return [];
	}
}


describe('AbstractAggregate', function () {

	/** @type {Aggregate} */
	let agg;
	beforeEach(() => {
		agg = new Aggregate({ id: 1 });
	});

	it('is a base class for Aggregate description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('constructor(id, state, events)', () => {

		it('throws exception if event handler is not defined', () => {

			class AggregateWithoutHandler extends AbstractAggregate {
				static get handles() {
					return ['somethingHappened'];
				}
			}

			expect(() => new AggregateWithoutHandler({ id: 1 })).to.throw('\'somethingHappened\' handler is not defined or not a function');
		});
	});

	describe('id', () => {

		it('returns immutable aggregate id', () => {

			expect(agg.id).to.equal(1);
			expect(() => agg.id = 2).to.throw(TypeError);
		});
	});

	describe('changes', () => {

		it('contains an EventStream of changes happened in aggregate', () => {

			const { changes } = agg;

			expect(changes).to.be.an('Array');
			expect(changes).to.be.empty;
			expect(changes).to.not.equal(agg.changes);
			expect(() => agg.changes = []).to.throw(TypeError);

			return agg.doSomething({}, blankContext).then(() => {

				expect(agg).to.have.nested.property('changes[0].type', 'somethingDone');
				expect(agg).to.have.nested.property('changes[0].aggregateId', 1);
				expect(agg).to.have.nested.property('changes[0].aggregateVersion', 0);
			});
		});
	});

	describe('version', () => {

		it('is a read-only auto-incrementing aggregate version, starting from 0', () => {

			expect(agg.version).to.equal(0);
			expect(() => agg.version = 1).to.throw(TypeError);
		});

		it('restores, when aggregate is restored from event stream', () => {

			const events = [
				{ type: 'somethingDone' },
				{ type: 'somethingDone' },
				{ type: 'somethingDone' }
			];

			const agg2 = new Aggregate({ id: 1, events });

			expect(agg2).to.have.property('version', 3);
		});

		it('restores, when aggregate is restored from a snapshot');
	});

	describe('state', () => {

		it('is an inner aggregate state', () => {

			expect(agg.state).to.exist;
		});

		it('is optional', () => {

			const statelessAggregate = new StatelessAggregate({ id: 2 });
			expect(statelessAggregate.state).to.not.exist;
		});
	});

	describe('handle(command)', () => {

		it('exists', () => expect(agg).to.respondTo('handle'));

		it('passes command to a handler declared within aggregate, returns a Promise', async () => {

			await agg.handle({ type: 'doSomething' });

			expect(agg).to.have.nested.property('changes[0].type', 'somethingDone');
		});

		it('throws error, if command handler is not defined', async () => {

			try {
				await agg.handle({ type: 'doSomethingUnexpected' });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				expect(err).to.have.property('message', '\'doSomethingUnexpected\' handler is not defined or not a function');
			}
		});

		it('invokes aggregate.emit for each event produced', async () => {

			sinon.spy(agg, 'emit');

			await agg.handle({ type: 'doSomething' });

			assert(agg.emit.calledOnce, 'emit was not called once');
		});
	});

	describe('emit(eventType, eventPayload)', () => {

		it('pushes new event to #changes', () => {

			agg.emit('eventType', {});
			expect(agg).to.have.nested.property('changes[0].type', 'eventType');
		});

		it('increments aggregate #version', () => {

			agg.emit('eventType', {});
			agg.emit('eventType', {});
			expect(agg).to.have.property('version', 2);
		});

		it('invokes aggregate.mutate', () => {

			sinon.spy(agg, 'mutate');

			agg.emit('somethingHappened', {});

			assert(agg.mutate.calledOnce, 'mutate was not called once');
		});
	});

	describe('mutate(event)', () => {

		const event = { type: 'somethingHappened' };

		it('exists', () => expect(agg).to.respondTo('mutate'));

		it('increases aggregate version', () => {

			const initialVersion = agg.version;

			agg.mutate({ type: 'doSomething' });

			expect(agg.version).to.eq(initialVersion + 1);
		});

		it('invokes aggregate.state.mutate', () => {
			sinon.spy(agg.state, 'mutate');

			agg.mutate(event);

			assert(agg.state.mutate.calledOnce, 'state.mutate was not called once');
		});

		it('does not mutate state if state event handler is not defined', () => {

			const state = new class AggregateState {
				somethingHappened() { }
			}();
			sinon.spy(state, 'somethingHappened');

			agg = new Aggregate({ id: 2, state });
			agg.mutate(event);

			assert(state.somethingHappened.calledOnce, 'somethingHappened handler was not called once');

			expect(() => agg.mutate({ type: 'somethingStatelessHappened' })).to.not.throw();
		});
	});

	describe('makeSnapshot()', () => {

		it('creates a snapshot object with aggregate state', async () => {

			await agg.handle({ type: 'doSomething' });

			const snapshot = agg.makeSnapshot();

			expect(snapshot).to.be.an('object');
			expect(snapshot).to.have.property('lastEvent').that.eqls(agg.changes[agg.changes.length - 1]);
			expect(snapshot).to.have.property('schemaVersion', 0);
			expect(snapshot).to.have.property('data').that.eqls(agg.state);
		});
	});

	describe('restoreSnapshot(snapshotEvent)', () => {

		/** @type {TSnapshot} */
		const snapshot = {
			lastEvent: { type: 'somethingHappened', aggregateVersion: 0 },
			schemaVersion: 0,
			data: { somethingDone: 1 }
		};

		it('restores aggregate state from a snapshot', () => {

			agg.restoreSnapshot(snapshot);

			expect(agg).to.have.property('state').that.deep.equals(snapshot.data);
		});


		it('validates arguments', () => {

			expect(() => agg.restoreSnapshot(undefined)).to.throw(TypeError);

			for (const keyToMiss of Object.keys(snapshot)) {
				const keysToCopy = Object.keys(snapshot).filter(k => k !== keyToMiss);
				const brokenSnapshot = JSON.parse(JSON.stringify(snapshot, keysToCopy));

				expect(() => agg.restoreSnapshot(brokenSnapshot)).to.throw(TypeError);
			}

			expect(() => agg.restoreSnapshot(snapshot)).to.not.throw();
		});
	});
});
