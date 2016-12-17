'use strict';

const { SagaEventHandler, Container, InMemoryEventStorage, EventStore, CommandBus, AbstractSaga } = require('..');

class Saga extends AbstractSaga {
	static get handles() {
		return ['somethingHappened'];
	}
	_somethingHappened(event) {
		super.enqueue('doSomething', { foo: 'bar' });
	}
}

describe('SagaEventHandler', function () {

	it('exists', () => {
		expect(SagaEventHandler).to.be.a('Function');
	});

	it('restores saga from eventStore, passes in received event and sends emitted commands', done => {

		try {
			const domain = new Container();
			domain.registerInstance({ hostname: 'test' }, 'eventStoreConfig');
			domain.register(InMemoryEventStorage, 'storage');
			domain.register(EventStore, 'eventStore');
			domain.register(CommandBus, 'commandBus');
			domain.registerSaga(Saga);
			domain.createAllInstances();

			domain.commandBus.on('doSomething', command => done());

			domain.eventStore.commit([{
				type: 'somethingHappened',
				sagaId: 1,
				sagaVersion: 0
			}]).catch(done);
		}
		catch (err) {
			done(err);
		}
	});
});
