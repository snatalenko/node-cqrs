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

	it('upon new command restores aggregate from eventStore and passes the command to aggregate');

	it('after command processed by aggregate, commits produced events to eventStore');
});
