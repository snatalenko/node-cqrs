'use strict';

const expect = require('chai').expect;
const mocks = require('./mocks');
const AbstractAggregate = require('../index').AbstractAggregate;
const Aggregate = mocks.Aggregate;
const StatelessAggregate = mocks.StatelessAggregate;

let agg;

describe('AbstractAggregate', function () {

	beforeEach(function () {
		agg = new Aggregate(1, []);
	});

	it('provides base class for aggregates description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('#id', function () {
		it('is a read-only aggregate ID', function () {
			expect(agg.id).to.equal(1);
			expect(function () {
				agg.id = 2;
			}).to.throw(TypeError);
		});
	});

	describe('#changes', function () {

		it('contains a read-only list of changes happened in aggregate', function () {

			expect(agg.changes).to.be.instanceof(Array);
			expect(agg.changes).to.be.empty;
			expect(agg.changes).to.not.equal(agg.changes);
			expect(function () {
				agg.changes = [];
			}).to.throw(TypeError);

			agg.doSomething({}, mocks.blankContext);

			expect(agg).to.have.deep.property('changes[0].type', 'somethingDone');
			expect(agg).to.have.deep.property('changes[0].aggregateId', 1);
			expect(agg).to.have.deep.property('changes[0].version', 0);
		});
	});

	describe('#emit(eventType:string, payload:object)', function () {

		it('pushes new event to #changes', function () {

			agg.emit('eventType', {});
			expect(agg).to.have.deep.property('changes[0].type', 'eventType');
		});

		it('increments aggregate #version', function() {

			agg.emit('eventType', {});
			agg.emit('eventType', {});
			expect(agg).to.have.property('version', 2);
		})
	});

	describe('#version', function () {

		it('is a read-only auto-incrementing aggregate version, starting from 0', function () {

			expect(agg.version).to.equal(0);
			expect(function () {
				agg.version = 1;
			}).to.throw(TypeError);
		});

		it('restores, when aggregate is restored from event stream', function () {

			const eventStream = [{
				type: 'somethingDone',
			}, {
				type: 'somethingDone',
			}, {
				type: 'somethingDone',
			}];

			const agg2 = new Aggregate(1, eventStream);

			expect(agg2).to.have.property('version', 3);
		});

		it('restores, when aggregate is restored from a snapshot');
	});

	describe('#state', function () {

		it('is an inner aggregate state', function () {

			expect(agg.state).to.exist;
		});

		it('is optional', function () {

			const statelessAggregate = new StatelessAggregate(2);
			expect(statelessAggregate.state).to.not.exist;
		});
	});

	describe('#snapshot', function () {

		it('provides a read-only aggregate state snapshot', function () {

			expect(agg.snapshot).to.exist;
			expect(agg.snapshot).to.deep.equal(agg.state);
			expect(agg.snapshot).to.not.equal(agg.state);
			expect(agg.snapshot).to.not.equal(agg.snapshot);
			expect(function () {
				agg.snapshot = {};
			}).to.throw(TypeError);
		});
	});

});
