import {
	AbstractSaga,
	EventDispatcher,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from '../../src';
import { Deferred } from '../../src/utils/Deferred.ts';

describe('AbstractSaga.register', function () {
	it('wires saga handler to event store', async () => {
		class RegisteredSaga extends AbstractSaga {
			static get startsWith() {
				return ['somethingHappened'];
			}
			somethingHappened(_event: any) {
				this.enqueue('doSomething');
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

		const commandBus = new InMemoryMessageBus();
		RegisteredSaga.register(eventStore, commandBus);

		const deferred = new Deferred<any>();
		commandBus.on('doSomething', command => deferred.resolve(command));

		await eventStore.dispatch([{ id: 'e1', type: 'somethingHappened', aggregateId: 1, payload: undefined } as any]);

		const cmd = await deferred.promise;
		expect(cmd).toHaveProperty('type', 'doSomething');
	});
});

