'use strict';

const {
	AbstractSaga,
	AbstractAggregate,
	ContainerBuilder,
	InMemoryEventStorage,
	InMemoryMessageBus
} = require('../..');

class A extends AbstractAggregate {

	start() {
		this.emit('event1');
	}

	command1() {
		this.emit('event2');
	}

	command2() {
		this.emit('event3');
	}
}

class S1 extends AbstractSaga {

	static get startsWith() {
		return ['event1'];
	}

	static get handles() {
		return ['event3'];
	}

	event1(e) {
		this.enqueue('command1', e.aggregateId);
	}

	event3() { }
}

class S2 extends AbstractSaga {

	static get startsWith() {
		return ['event2'];
	}

	static get handles() {
		return ['event3'];
	}

	event2(e) {
		this.enqueue('command2', e.aggregateId);
	}

	event3() { }
}


describe('SagaEventHandler', () => {

	let container;

	beforeEach(() => {
		const builder = new ContainerBuilder();
		builder.register(InMemoryEventStorage).as('storage');
		builder.register(InMemoryMessageBus).as('messageBus');
		builder.registerAggregate(A);
		builder.registerSaga(S1);
		builder.registerSaga(S2);

		container = builder.container();

		// container.eventStore.on('event1', console.log);
		// container.eventStore.on('event2', console.log);
		// container.eventStore.on('event3', console.log);
	});

	it.skip('handles overlapping saga events', async () => {

		await container.commandBus.send('start');

		await container.eventStore.once('event1');
		await container.eventStore.once('event2');
		await container.eventStore.once('event3');
	});
});
