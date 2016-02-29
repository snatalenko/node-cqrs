'use strict';

const cqrs = require('..');
const SagaEventHandler = cqrs.SagaEventHandler;
const chai = require('chai');
const expect = chai.expect;

describe('SagaEventHandler', function () {

	it('exists', () => {
		expect(SagaEventHandler).to.be.a('Function');
	});

	it('subscribes to events handled by Saga');

	it('upon new event restores saga from eventStore and passes the event to saga');

	it('after event processed by saga, sends produced commands to commandBus');
});
