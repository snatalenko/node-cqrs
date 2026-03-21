import {
	AbstractAggregate,
	CommandBus,
	EventDispatcher,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from '../../src';

describe('AbstractAggregate.register', function () {
	it('wires aggregate command handler to command bus', async () => {
		class RegisteredAggregate extends AbstractAggregate<void> {
			doThing() {
				this.emit('thingDone');
			}
		}

		const eventBus = new InMemoryMessageBus();
		const eventDispatcher = new EventDispatcher({ eventBus });
		const eventStorage = new InMemoryEventStorage();
		const eventStore = new EventStore({
			eventStorageReader: eventStorage,
			identifierProvider: eventStorage,
			eventBus,
			eventDispatcher
		});

		const commandBus = new CommandBus();
		RegisteredAggregate.register(eventStore, commandBus);

		const [evt] = await commandBus.send('doThing', undefined, { payload: undefined });
		expect(evt).toHaveProperty('type', 'thingDone');
		expect(evt).toHaveProperty('aggregateId');
	});
});

