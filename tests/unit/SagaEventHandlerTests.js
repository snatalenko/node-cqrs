'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { SagaEventHandler, InMemoryEventStorage, EventStore, CommandBus, AbstractSaga, InMemoryMessageBus } = require('../..');

const EVENT1 = 'event1';
const CMD1 = 'command1';
const EVENT2 = 'event2';
const CMD2 = 'command2';

class S1 extends AbstractSaga {
	static get startsWith() {
		return [EVENT1];
	}
	static get handles() {
		return [EVENT2];
	}
	[EVENT1]() {
		super.enqueue(CMD1, undefined, { foo: 'bar' });
	}
	[EVENT2]() {
		super.enqueue(CMD2, undefined, { foo: 'bar' });
	}
	onError(error, { command, event }) {
		super.enqueue('fixError', undefined, { error, command, event });
	}
}

const triggeringEvent = {
	type: EVENT1,
	aggregateId: 1
};

describe('SagaEventHandler', function () {

	let commandBus;
	let eventStore;
	let handler1;

	beforeEach(() => {
		const storage = new InMemoryEventStorage();
		const messageBus = new InMemoryMessageBus();

		commandBus = new CommandBus({ messageBus });
		eventStore = new EventStore({ storage, messageBus });
		handler1 = new SagaEventHandler({ sagaType: S1, eventStore, commandBus });

		sinon.spy(handler1, '_createSaga');
		sinon.spy(handler1, '_restoreSaga');
		sinon.spy(eventStore, 'getStream');
	});

	it('creates saga on saga starter events', async () => {

		expect(handler1._createSaga).to.have.property('callCount', 0);
		expect(handler1._restoreSaga).to.have.property('callCount', 0);
		expect(eventStore.getStream).to.have.property('callCount', 0);

		await handler1.handle({
			type: EVENT1,
			aggregateId: 1
		});

		expect(handler1._createSaga).to.have.property('callCount', 1);
		expect(handler1._restoreSaga).to.have.property('callCount', 0);
		expect(eventStore.getStream).to.have.property('callCount', 0);
	});

	it('restores saga eventStream on saga handled events', async () => {

		expect(handler1._createSaga).to.have.property('callCount', 0);
		expect(handler1._restoreSaga).to.have.property('callCount', 0);
		expect(eventStore.getStream).to.have.property('callCount', 0);

		await handler1.handle({
			type: EVENT2,
			aggregateId: 1,
			sagaId: 1,
			sagaVersion: 0
		});

		expect(handler1._createSaga).to.have.property('callCount', 0);
		expect(handler1._restoreSaga).to.have.property('callCount', 1);
		expect(eventStore.getStream).to.have.property('callCount', 1);
	});

	it('sends emitted commands', async () => {

		const doSomethingCommandHandler = new Promise(resolve => {
			commandBus.on(CMD1, resolve);
		});

		await handler1.handle(triggeringEvent);

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
		commandBus.on(CMD1, command => {
			throw new Error('command execution failed');
		});

		handler1.handle(triggeringEvent);

		const fixConfirmationCommand = await pendingPromise;

		expect(fixConfirmationCommand).to.have.property('type', 'fixError');
		expect(fixConfirmationCommand).to.have.nested.property('payload.event', triggeringEvent);
		expect(fixConfirmationCommand).to.have.nested.property('payload.command.type', CMD1);
		expect(fixConfirmationCommand).to.have.nested.property('payload.error.message', 'command execution failed');
	});
});
