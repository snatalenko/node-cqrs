'use strict';

const {
	EventStore,
	InMemoryEventStorage,
	AbstractSaga,
	AbstractAggregate,
	CommandBus
} = require('../..');

const storage = new InMemoryEventStorage();

const es = new EventStore({
	storage,
	logger: console
});

const bus = new CommandBus({
	logger: console
});

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

async function getEvents(streamId) {
	const events = [];
	for await (const event of es.getStream(streamId))
		events.push(event);

	return events;
}


describe('multiple sagas flow', () => {

	it('works', async () => {

		const passToAggregate = async cmd => {
			const aggregateId = cmd.aggregateId || `agg-${await es.getNewId()}`;

			const events = await getEvents(aggregateId);
			const a = new Aggregate({ id: aggregateId, events });
			a.handle(cmd);

			await es.commitStream(aggregateId, a.changes);
		};

		const startSaga = SagaType => async sagaStarterEvent => {
			const sagaId = `${SagaType.name}-${await es.getNewId()}`;
			const saga = new SagaType({ id: sagaId, events: [] });

			saga.apply(sagaStarterEvent);

			// it's already stored. need to create a reference
			es.commitStream(sagaId, [sagaStarterEvent]);

			for (const cmd of saga.uncommittedMessages)
				await bus.sendRaw(cmd);
		};

		const passToSaga = SagaType => async sagaEvent => {
			// event comes as a response to command initiated by Saga
			const sagaId = sagaEvent.sagaId;

			const events = await getEvents(sagaId);
			const saga = new SagaType({ id: sagaId, events });

			saga.apply(sagaEvent);

			// it's already stored. need to create a reference
			es.commitStream(sagaId, [sagaEvent]);

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
