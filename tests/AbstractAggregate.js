'use strict';

const { AbstractAggregate, EventStream } = require('..');
const blankContext = require('./mocks/blankContext');
const delay = ms => new Promise(rs => setTimeout(rs, ms));

require('chai').should();

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

	async doSomething(payload, context) {
		await delay(100);
		this.emit('somethingDone', payload);
	}

	doSomethingWrong(payload, context) {
		throw new Error('something went wrong');
	}

	doSomethingStateless(payload, context) {
		this.emit('somethingStatelessHappened', payload);
	}
}

class StatelessAggregate extends AbstractAggregate {
	static get handles() {
		return [];
	}
}


describe('AbstractAggregate', function () {

	let agg;
	beforeEach(() => {
		agg = new Aggregate({ id: 1 });
	});

	it('is a base class for Aggregate description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('constructor(id, state, events)', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class AggregateWithoutHandles extends AbstractAggregate { }

			expect(() => s = new AggregateWithoutHandles({ id: 1 })).to.throw('handles must be overridden to return a list of handled command types');
		});

		it('throws exception if event handler is not defined', () => {

			class AggregateWithoutHandler extends AbstractAggregate {
				static get handles() {
					return ['somethingHappened'];
				}
			}

			expect(() => s = new AggregateWithoutHandler({ id: 1 })).to.throw('\'somethingHappened\' handler is not defined or not a function');
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

			expect(changes).to.be.instanceof(EventStream);
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

		it('exists', () => agg.should.respondTo('handle'));

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

		it('exists', () => agg.should.respondTo('mutate'));

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
			};
			sinon.spy(state, 'somethingHappened');

			agg = new Aggregate({ id: 2, state });
			agg.mutate(event);

			assert(state.somethingHappened.calledOnce, 'somethingHappened handler was not called once');

			expect(() => agg.mutate({ type: 'somethingStatelessHappened' })).to.not.throw();
		});


		const snapshotEvent = { aggregateVersion: 1, type: 'snapshot', payload: { somethingDone: 1 } };

		it('invokes aggregate.restoreSnapshot, when snapshot event provided', () => {
			sinon.spy(agg, 'restoreSnapshot');

			expect(agg).to.have.nested.property('restoreSnapshot.called', false);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.nested.property('restoreSnapshot.calledOnce', true);
		});

		it('restores aggregate version and snapshotVersion, when snapshot event provided', () => {

			expect(agg).to.have.property('snapshotVersion', 0);
			expect(agg).to.have.property('version', 0);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.property('snapshotVersion', snapshotEvent.aggregateVersion);
			expect(agg).to.have.property('version', snapshotEvent.aggregateVersion + 1);
		});
	});

	describe('takeSnapshot()', () => {

		it('exists', () => {
			expect(agg).to.respondTo('takeSnapshot');
		});

		it('adds aggregate state snapshot to the changes queue', async () => {

			await agg.handle({ type: 'doSomething' });

			agg.takeSnapshot();

			const { changes } = agg;

			expect(changes).to.have.length(2);

			expect(changes[0]).to.have.property('type', 'somethingDone');
			expect(changes[1]).to.have.property('type', 'snapshot');
			expect(changes[1]).to.have.property('payload').that.deep.equals(agg.state);
		});
	});

	describe('restoreSnapshot(snapshotEvent)', () => {

		const snapshotEvent = { type: 'snapshot', payload: { somethingDone: 1 } };

		it('exists', () => {
			expect(agg).to.respondTo('restoreSnapshot');
		});

		it('validates arguments', () => {

			expect(() => agg.restoreSnapshot()).to.throw(TypeError);

			for (const keyToMiss of Object.keys(snapshotEvent)) {
				const keysToCopy = Object.keys(snapshotEvent).filter(k => k !== keyToMiss);
				const brokenEvent = JSON.parse(JSON.stringify(snapshotEvent, keysToCopy));

				expect(() => agg.restoreSnapshot(brokenEvent)).to.throw(TypeError);
			}

			expect(() => agg.restoreSnapshot({ aggregateVersion: 1, type: 'somethingHappened', payload: {} })).to.throw('snapshot event type expected');

			expect(() => agg.restoreSnapshot(snapshotEvent)).to.not.throw();
		});

		it('being invoked by mutate(event)', () => {
			sinon.spy(agg, 'restoreSnapshot');

			agg.mutate({ type: 'somethingDone' });

			expect(agg).to.have.nested.property('restoreSnapshot.called', false);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.nested.property('restoreSnapshot.calledOnce', true);
		});

		it('restores aggregate state from a snapshot', () => {

			agg.restoreSnapshot(snapshotEvent);

			expect(agg).to.have.property('state').that.deep.equals(snapshotEvent.payload);
		});
	});
});
