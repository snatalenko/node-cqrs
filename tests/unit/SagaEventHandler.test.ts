import { expect } from 'chai';
import * as sinon from 'sinon';
import {
	SagaEventHandler,
	InMemoryEventStorage,
	EventStore,
	CommandBus,
	AbstractSaga,
	InMemoryMessageBus,
	Deferred,
	EventDispatcher
} from '../../src';

class Saga extends AbstractSaga {
	static get startsWith() {
		return ['somethingHappened'];
	}
	static get handles(): string[] {
		return ['followingHappened'];
	}
	somethingHappened(event) {
		super.enqueue('doSomething', undefined, { foo: 'bar' });
	}
	followingHappened() {
		super.enqueue('complete', undefined, { foo: 'bar' });
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

	let commandBus: CommandBus;
	let eventStore: EventStore;
	let sagaEventHandler: SagaEventHandler;

	beforeEach(() => {
		const eventBus = new InMemoryMessageBus();
		const eventDispatcher = new EventDispatcher({ eventBus });
		const storage = new InMemoryEventStorage();
		commandBus = new CommandBus({});
		eventStore = new EventStore({ storage, identifierProvider: storage, eventBus, eventDispatcher });
		sagaEventHandler = new SagaEventHandler({ sagaType: Saga, eventStore, commandBus });
	});

	it('exists', () => {
		expect(SagaEventHandler).to.be.a('Function');
	});

	it('restores saga state, passes in received event and sends emitted commands', async () => {

		const deferred = new Deferred();

		commandBus.on('complete', () => {
			deferred.resolve(undefined);
		})

		sinon.spy(eventStore, 'getSagaEvents');

		expect(eventStore.getSagaEvents).to.have.property('callCount', 0);

		await sagaEventHandler.handle({
			type: 'followingHappened',
			aggregateId: 1,
			sagaId: 1,
			sagaVersion: 0
		});

		expect(eventStore.getSagaEvents).to.have.property('callCount', 1);

		await deferred.promise;
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
