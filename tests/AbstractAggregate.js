'use strict';

const { AbstractAggregate, EventStream } = require('..');
const Aggregate = require('./mocks/Aggregate');
const StatelessAggregate = require('./mocks/StatelessAggregate');;
const blankContext = require('./mocks/blankContext');

require('chai').should();

describe('AbstractAggregate', function () {

	let agg;
	beforeEach(() => agg = new Aggregate({ id: 1 }));

	it('is a base class for Aggregate description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('constructor(id, state, events)', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class AggregateWithoutHandles extends AbstractAggregate {}

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

				expect(agg).to.have.deep.property('changes[0].type', 'somethingDone');
				expect(agg).to.have.deep.property('changes[0].aggregateId', 1);
				expect(agg).to.have.deep.property('changes[0].aggregateVersion', 0);
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

	describe('snapshot', () => {

		it('provides a read-only aggregate state snapshot', () => {

			expect(agg.snapshot).to.exist;
			expect(agg.snapshot).to.deep.equal(agg.state);
			expect(agg.snapshot).to.not.equal(agg.state);
			expect(agg.snapshot).to.not.equal(agg.snapshot);
			expect(function () {
				agg.snapshot = {};
			}).to.throw(TypeError);
		});
	});

	describe('handle(command)', () => {

		it('exists', () => agg.should.respondTo('handle'));

		it('passes command to a handler declared within aggregate, returns a Promise', () => {

			return agg.handle({ type: 'doSomething' }).then(() => {

				agg.should.have.deep.property('changes[0].type', 'somethingDone');
			});
		});
	});

	describe('mutate(event)', () => {

		it('exists', () => agg.should.respondTo('mutate'));
		it('mutates aggregate state based on event received and increments aggregate version');
	});

	describe('emit(eventType, eventPayload)', () => {

		it('pushes new event to #changes', () => {

			agg.emit('eventType', {});
			expect(agg).to.have.deep.property('changes[0].type', 'eventType');
		});

		it('increments aggregate #version', () => {

			agg.emit('eventType', {});
			agg.emit('eventType', {});
			expect(agg).to.have.property('version', 2);
		});
	});
});
