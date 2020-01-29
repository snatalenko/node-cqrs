'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { SagaEventHandler, InMemoryEventStorage, EventStore, CommandBus, AbstractSaga } = require('../..');

class Saga extends AbstractSaga {
	static get startsWith() {
		return ['somethingHappened'];
	}
	somethingHappened(event) {
		super.enqueue('doSomething', undefined, { foo: 'bar' });
	}
	onError(error, { command, event }) {
		super.enqueue('fixError', undefined, { error, command, event });
	}
}

const triggeringEvent = {
	type: 'somethingHappened',
	aggregateId: 1,
	sagaId: 1,
	sagaVersion: 0
};

describe('SagaEventHandler', function () {

	let commandBus;
	let eventStore;
	let sagaEventHandler;

	beforeEach(() => {
		commandBus = new CommandBus();
		eventStore = new EventStore({ storage: new InMemoryEventStorage() });
		sagaEventHandler = new SagaEventHandler({ sagaType: Saga, eventStore, commandBus });
	});

	it('exists', () => {
		expect(SagaEventHandler).to.be.a('Function');
	});

	it('restores saga state, passes in received event and sends emitted commands', async () => {

		const doSomethingCommandHandler = new Promise(resolve => {
			commandBus.on('doSomething', resolve);
		});

		sinon.spy(sagaEventHandler, '_restoreSaga');
		sinon.spy(eventStore, 'getSagaEvents');

		expect(sagaEventHandler._restoreSaga).to.have.property('callCount', 0);
		expect(eventStore.getSagaEvents).to.have.property('callCount', 0);

		await sagaEventHandler.handle(triggeringEvent);

		expect(sagaEventHandler._restoreSaga).to.have.property('callCount', 1);
		expect(eventStore.getSagaEvents).to.have.property('callCount', 1);

		await doSomethingCommandHandler;
	});

	it('passes command execution errors to saga.onError', async () => {

		let resolvePromise;
		const pendingPromise = new Promise(resolve => {
			resolvePromise = resolve;
		});

		commandBus.on('fixError', command => {
			resolvePromise(command);
		});
		commandBus.on('doSomething', command => {
			throw new Error('command execution failed');
		});

		sagaEventHandler.handle(triggeringEvent);

		const fixConfirmationCommand = await pendingPromise;

		expect(fixConfirmationCommand).to.have.property('type', 'fixError');
		expect(fixConfirmationCommand).to.have.nested.property('payload.event', triggeringEvent);
		expect(fixConfirmationCommand).to.have.nested.property('payload.command.type', 'doSomething');
		expect(fixConfirmationCommand).to.have.nested.property('payload.error.message', 'command execution failed');
	});
});
