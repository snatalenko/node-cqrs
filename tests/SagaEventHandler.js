'use strict';

const { SagaEventHandler, InMemoryEventStorage, EventStore, CommandBus, AbstractSaga } = require('..');

class Saga extends AbstractSaga {
	static get handles() {
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
	aggregateId: 1
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

	it('restores saga from eventStore, passes in received event and sends emitted commands', done => {

		commandBus.on('doSomething', command => done());

		sagaEventHandler.handle(triggeringEvent);
	});

	it('passes command execution errors to saga.onError', async () => {

		let resolvePromise;
		const pendingPromise = new Promise(resolve => { resolvePromise = resolve; });

		commandBus.on('fixError', command => {
			resolvePromise(command);
		});
		commandBus.on('doSomething', command => {
			throw new Error('command execution failed');
		});

		sagaEventHandler.handle(triggeringEvent);

		const fixConfirmationCommand = await pendingPromise;

		expect(fixConfirmationCommand).to.have.property('type', 'fixError');
		expect(fixConfirmationCommand).to.have.deep.property('payload.event', triggeringEvent);
		expect(fixConfirmationCommand).to.have.deep.property('payload.command.type', 'doSomething');
		expect(fixConfirmationCommand).to.have.deep.property('payload.error.message', 'command execution failed');
	});
});
