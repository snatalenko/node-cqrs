'use strict';

const cqrs = require('..');
const AggregateCommandHandler = cqrs.AggregateCommandHandler;
const chai = require('chai');
const expect = chai.expect;

describe('AggregateCommandHandler', function () {

	it('exists', () => {
		expect(AggregateCommandHandler).to.be.a('Function');
	});

	it('subscribes to commands handled by Aggregate');

	it('restores aggregate from event store');

	it('passes command to aggregate');

	it('commits produced events to eventStore');
});
