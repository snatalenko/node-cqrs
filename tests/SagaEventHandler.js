'use strict';

const cqrs = require('..');
const SagaEventHandler = cqrs.SagaEventHandler;
const Saga = require('./mocks/Saga');
const chai = require('chai');
const expect = chai.expect;

describe.only('SagaEventHandler', function () {

	it('exists', () => {
		expect(SagaEventHandler).to.be.a('Function');
	});

	it('restores saga from eventStore, passes in received event and sends emitted commands', done => {

		const domain = new cqrs.Container();
		domain.register(cqrs.InMemoryEventStorage, 'storage');
		domain.register(cqrs.EventStore, 'eventStore');
		domain.register(cqrs.CommandBus, 'commandBus');
		domain.registerSaga(Saga);
		domain.createAllInstances();

		domain.commandBus.on('doSomething', command => done());

		domain.eventStore.commit([{
			type: 'somethingHappened',
			sagaId: 1
		}]);
	});
});
