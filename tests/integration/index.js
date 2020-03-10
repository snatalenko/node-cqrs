'use strict';

const {
	InMemoryEventStorage,
	InMemoryMessageBus,
	AbstractSaga,
	AbstractAggregate,
	CommandBus,
	EventStore
} = require('../..');

const logger = console;
const storage = new InMemoryEventStorage({ logger });
const messageBus = new InMemoryMessageBus();

const es = new EventStore({ storage, messageBus, logger });
const bus = new CommandBus({ logger });

class Aggregate extends AbstractAggregate {
	doSomething() {
		this.emit('somethingHappened', {
			foo: 'bar'
		});
	}

	doSomethingAgain() {
		this.emit('somethingHappenedAgain', {
			foo: 'baz'
		});
	}
}

class Saga1 extends AbstractSaga {

	static get startsWith() {
		return ['somethingHappened'];
	}

	somethingHappened(e) {
		this.enqueue('doSomethingAgain', e.aggregateId);
	}

	somethingHappenedAgain() {

	}
}

class Saga2 extends AbstractSaga {

	static get startsWith() {
		return ['somethingHappenedAgain'];
	}

	somethingHappenedAgain() {

	}
}

async function getEvents(streamId, filter) {
	const events = [];
	for await (const event of es.getStream(streamId, filter))
		events.push(event);

	return events;
}


describe('multiple sagas flow', () => {

	it('works', async () => {

		const passToAggregate = async cmd => {
			const aggregateId = cmd.aggregateId || `${Aggregate.name} id:${await es.getNewId()}`;

			const events = await getEvents(aggregateId);
			const a = new Aggregate({ id: aggregateId, events });
			a.handle(cmd);

			const emittedEvents = a.changes;

			await es.commit(aggregateId, emittedEvents);
		};

		const startSaga = SagaType => async sagaStarterEvent => {
			const sagaId = `${SagaType.name} id:${await es.getNewId()}`;
			const saga = new SagaType({ id: sagaId, events: [] });

			saga.apply(sagaStarterEvent);

			// it's already stored. need to create a reference
			es.commit(sagaId, [sagaStarterEvent]);

			for (const cmd of saga.uncommittedMessages)
				await bus.sendRaw(cmd);
		};

		const passToSaga = SagaType => async sagaEvent => {
			// event comes as a response to command initiated by Saga
			const sagaId = sagaEvent.sagaId;

			const events = await getEvents(sagaId, { beforeEvent: sagaEvent });
			const saga = new SagaType({ id: sagaId, events });

			saga.apply(sagaEvent);

			// it's already stored. need to create a reference
			es.commit(sagaId, [sagaEvent]);

			for (const cmd of saga.uncommittedMessages)
				await bus.sendRaw(cmd);
		};

		bus.on('doSomething', passToAggregate);
		bus.on('doSomethingAgain', passToAggregate);

		es.on('somethingHappened', startSaga(Saga1));
		es.on('somethingHappenedAgain', passToSaga(Saga1));
		es.on('somethingHappenedAgain', startSaga(Saga2));

		bus.send('doSomething', undefined);
	});
});
