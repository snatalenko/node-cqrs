import {
	AbstractAggregate,
	AbstractSaga,
	CommandBus,
	EventIdAugmentor,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from 'node-cqrs';

type SignupUserPayload = { email: string };

class SignupAggregate extends AbstractAggregate<void> {
	signupUser(payload: SignupUserPayload) {
		this.emit('userSignedUp', { email: payload.email });
	}
}

class WelcomeEmailSaga extends AbstractSaga {
	userSignedUp(event: any) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload.email });
	}
}

async function main() {
	const eventBus = new InMemoryMessageBus();
	const eventStorage = new InMemoryEventStorage();
	const eventStore = new EventStore({
		eventStorageReader: eventStorage,
		identifierProvider: eventStorage,
		eventDispatchPipeline: [
			new EventIdAugmentor({ identifierProvider: eventStorage }),
			eventStorage
		],
		eventBus
	});

	const commandBus = new CommandBus();

	let resolveWelcomeEmail!: () => void;
	const welcomeEmailSent = new Promise<void>(resolve => {
		resolveWelcomeEmail = resolve;
	});

	commandBus.on('sendWelcomeEmail', command => {
		console.log('sendWelcomeEmail command:', command);
		resolveWelcomeEmail();
		return [];
	});

	SignupAggregate.register(eventStore, commandBus);
	WelcomeEmailSaga.register(eventStore, commandBus);

	const [userSignedUp] = await commandBus.send('signupUser', undefined, {
		payload: { email: 'john@example.com' } satisfies SignupUserPayload
	});

	console.log('userSignedUp event (starter id used as saga origin):', userSignedUp);

	await welcomeEmailSent;
}

await main();
