import { expect, assert, AssertionError } from 'chai';

import * as sinon from 'sinon';
import { AbstractAggregate } from '../../src/AbstractAggregate';
import { Identifier, IEventSet } from '../../src/interfaces';

const delay = ms => new Promise(rs => setTimeout(rs, ms));

class AggregateState {
	mutate(event) {
		this[event.type] = (this[event.type] || 0) + 1;
	}
}

class Aggregate extends AbstractAggregate<any> {

	static get handles() {
		return ['doSomething', 'doSomethingWrong', 'doSomethingStateless'];
	}

	constructor({
		id,
		state,
		events
	}: {
		id: Identifier,
		state?: any,
		events?: IEventSet
	}) {
		super({ id, state: state || new AggregateState(), events });
	}

	async doSomething(payload: any) {
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

class StatelessAggregate extends AbstractAggregate<void> {
	static get handles() {
		return [];
	}
}


describe('AbstractAggregate', function () {

	let agg: Aggregate;
	beforeEach(() => {
		agg = new Aggregate({ id: 1 });
	});

	it('is a base class for Aggregate description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('constructor(id, state, events)', () => {

		it('throws exception if event handler is not defined', () => {

			class AggregateWithoutHandler extends AbstractAggregate<void> {
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
			expect(() => {
				(agg as any).id = 2;
			}).to.throw(TypeError);
		});
	});

	describe('popChanges', () => {

		it('contains an EventStream of changes happened in aggregate', async () => {

			const changes0 = agg.popChanges();

			expect(changes0).to.be.an('Array');
			expect(changes0).to.be.empty;

			const changes = await agg.handle({ type: 'doSomething' });

			expect(changes).to.not.equal(changes0);
			expect(changes).to.have.nested.property('[0].type', 'somethingDone');
			expect(changes).to.have.nested.property('[0].aggregateId', 1);
			expect(changes).to.have.nested.property('[0].aggregateVersion', 0);
		});
	});

	describe('version', () => {

		it('is a read-only auto-incrementing aggregate version, starting from 0', () => {

			expect(agg.version).to.equal(0);
			expect(() => {
				(agg as any).version = 1;
			}).to.throw(TypeError);
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
	});

	describe('state', () => {

		it('is an inner aggregate state', () => {

			expect((agg as any).state).to.exist;
		});

		it('is optional', () => {

			const statelessAggregate = new StatelessAggregate({ id: 2 });
			expect((statelessAggregate as any).state).to.not.exist;
		});
	});

	describe('handle(command)', () => {

		it('exists', () => {
			expect(agg).to.respondTo('handle');
		});

		it('passes command to a handler declared within aggregate, returns a Promise', async () => {

			const changes = await agg.handle({ type: 'doSomething' });

			expect(changes).to.have.nested.property('[0].type', 'somethingDone');
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

			const emitSpy = sinon.spy(agg as any, 'emit');

			await agg.handle({ type: 'doSomething' });

			assert(emitSpy.calledOnce, 'emit was not called once');
		});
	});

	describe('emit(eventType, eventPayload)', () => {

		it('pushes new event to #changes', () => {

			(agg as any).emit('eventType', {});

			const changes = agg.popChanges();
			expect(changes).to.have.nested.property('[0].type', 'eventType');
		});

		it('increments aggregate #version', () => {

			(agg as any).emit('eventType', {});
			(agg as any).emit('eventType', {});
			expect(agg).to.have.property('version', 2);
		});

		it('invokes aggregate.mutate', () => {

			const mutateSpy = sinon.spy(agg, 'mutate');

			(agg as any).emit('somethingHappened', {});

			assert(mutateSpy.calledOnce, 'mutate was not called once');
		});
	});

	describe('mutate(event)', () => {

		const event = { type: 'somethingHappened' };

		it('exists', () => {
			expect(agg).to.respondTo('mutate');
		});

		it('increases aggregate version', () => {

			const initialVersion = agg.version;

			agg.mutate({ type: 'doSomething' });

			expect(agg.version).to.eq(initialVersion + 1);
		});

		it('invokes aggregate.state.mutate', () => {
			const mutateSpy = sinon.spy((agg as any).state, 'mutate');

			agg.mutate(event);

			assert(mutateSpy.calledOnce, 'state.mutate was not called once');
		});

		it('does not mutate state if state event handler is not defined', () => {

			const state = new class AnotherAggregateState {
				somethingHappened() { }
			}();
			const somethingHappenedSpy = sinon.spy(state, 'somethingHappened');

			agg = new Aggregate({ id: 2, state });
			agg.mutate(event);

			assert(somethingHappenedSpy.calledOnce, 'somethingHappened handler was not called once');

			expect(() => agg.mutate({ type: 'somethingStatelessHappened' })).to.not.throw();
		});


		const snapshotEvent = { aggregateVersion: 1, type: 'snapshot', payload: { somethingDone: 1 } };

		it('invokes aggregate.restoreSnapshot, when snapshot event provided', () => {
			sinon.spy(agg as any, 'restoreSnapshot');

			expect(agg).to.have.nested.property('restoreSnapshot.called', false);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.nested.property('restoreSnapshot.calledOnce', true);
		});

		it('restores aggregate version and snapshotVersion, when snapshot event provided', () => {

			expect(agg).to.have.property('snapshotVersion', undefined);
			expect(agg).to.have.property('version', 0);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.property('snapshotVersion', snapshotEvent.aggregateVersion);
			expect(agg).to.have.property('version', snapshotEvent.aggregateVersion + 1);
		});
	});

	describe('makeSnapshot()', () => {

		it('exists', () => {
			expect(agg).to.respondTo('makeSnapshot');
		});

		it('adds aggregate state snapshot to the changes queue', async () => {

			class AggregateWithSnapshot extends Aggregate {
				protected get shouldTakeSnapshot(): boolean {
					return true;
				}
			}

			agg = new AggregateWithSnapshot({ id: 1 });

			const changes = await agg.handle({ type: 'doSomething' });

			expect(changes).to.have.length(2);

			expect(changes[0]).to.have.property('type', 'somethingDone');
			expect(changes[1]).to.have.property('type', 'snapshot');
			expect(changes[1]).to.have.property('payload').that.deep.equals((agg as any).state);
		});
	});

	describe('restoreSnapshot(snapshotEvent)', () => {

		const snapshotEvent = { type: 'snapshot', payload: { somethingDone: 1 } };

		it('exists', () => {
			expect(agg).to.respondTo('restoreSnapshot');
		});

		it('validates arguments', () => {

			expect(() => (agg as any).restoreSnapshot()).to.throw(TypeError);

			for (const keyToMiss of Object.keys(snapshotEvent)) {
				const keysToCopy = Object.keys(snapshotEvent).filter(k => k !== keyToMiss);
				const brokenEvent = JSON.parse(JSON.stringify(snapshotEvent, keysToCopy));

				expect(() => {
					(agg as any).restoreSnapshot(brokenEvent);
				}).to.throw(TypeError);
			}

			expect(() => (agg as any).restoreSnapshot({ aggregateVersion: 1, type: 'somethingHappened', payload: {} })).to.throw('snapshot event type expected');

			expect(() => (agg as any).restoreSnapshot(snapshotEvent)).to.not.throw();
		});

		it('being invoked by mutate(event)', () => {
			sinon.spy(agg as any, 'restoreSnapshot');

			agg.mutate({ type: 'somethingDone' });

			expect(agg).to.have.nested.property('restoreSnapshot.called', false);

			agg.mutate(snapshotEvent);

			expect(agg).to.have.nested.property('restoreSnapshot.calledOnce', true);
		});

		it('restores aggregate state from a snapshot', () => {

			(agg as any).restoreSnapshot(snapshotEvent);

			expect(agg).to.have.property('state').that.deep.equals(snapshotEvent.payload);
		});
	});
});
