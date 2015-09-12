'use strict';

const expect = require('chai').expect;
const AbstractAggregate = require('../index').AbstractAggregate;

class State {
	mutate() {}
}

class Aggregate extends AbstractAggregate {
	constructor(id, history) {
		super(id, new State(), history);
	}
}

describe('#AbstractAggregate', function () {

	const agg = new Aggregate(1, []);

	it('provides base class for aggregates description', function () {
		expect(agg).is.instanceof(AbstractAggregate);
	});

	describe('id', function () {
		it('is a read-only aggregate ID', function () {
			expect(agg.id).to.equal(1);
			expect(function () {
				agg.id = 2;
			}).to.throw(TypeError);
		});
	});

	describe('version', function () {
		it('is a read-only auto-incrementing aggregate version, starting from 0', function () {
			expect(agg.version).to.equal(0);
			expect(function () {
				agg.version = 1;
			}).to.throw(TypeError);
		});
	});

	describe('state', function () {
		it('is an inner aggregate state', function () {
			expect(agg.state).to.exist;
		});
	});

	describe('snapshot', function () {
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

	describe('changes', function () {
		it('contains a read-only list of changes happened in aggregate', function () {
			expect(agg.changes).to.be.instanceof(Array);
			expect(agg.changes).to.be.empty;
			expect(agg.changes).to.not.equal(agg.changes);
			expect(function () {
				agg.changes = [];
			}).to.throw(TypeError);
		});
	});
});
