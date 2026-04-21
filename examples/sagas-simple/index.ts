import { AbstractSaga, EventIdAugmentor, EventStore, InMemoryEventStorage, InMemoryMessageBus } from '../../src/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload, UserCreatedEvent } from '../user-domain-ts/messages.ts';

class WelcomeEmailSaga extends AbstractSaga {
	userCreated(event: UserCreatedEvent) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload!.username });
	}
}

async function main() {
	const eventBus = new InMemoryMessageBus();
	const eventStorage = new InMemoryEventStorage();
	const eventStore = new EventStore({
		eventStorage,
		eventDispatchPipeline: [
			new EventIdAugmentor({ identifierProvider: eventStorage }),
			eventStorage
		],
		eventBus
	});

	const commandBus = new InMemoryMessageBus();

	let resolveWelcomeEmail!: () => void;
	const welcomeEmailSent = new Promise<void>(resolve => {
		resolveWelcomeEmail = resolve;
	});

	commandBus.on('sendWelcomeEmail', command => {
		console.log('sendWelcomeEmail command:', command);
		resolveWelcomeEmail();
		return [];
	});

	UserAggregate.register(eventStore, commandBus);
	WelcomeEmailSaga.register(eventStore, commandBus);

	const [userCreated] = await commandBus.send('createUser', undefined, {
		payload: {
			username: 'john@example.com',
			password: 'magic'
		} satisfies CreateUserCommandPayload
	});

	console.log('userCreated event (starter id used as saga origin):', userCreated);

	await welcomeEmailSent;
}

await main();
