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

type ProvisionTrialPayload = { email: string };

class TrialAggregate extends AbstractAggregate<void> {
	provisionTrial(payload: ProvisionTrialPayload) {
		console.log('provisionTrial command (received by TrialAggregate):', this.command);
		this.emit('trialProvisioned', { email: payload.email });
	}
}

class WelcomeEmailSaga extends AbstractSaga {
	static get startsWith() {
		return ['userSignedUp'];
	}
	userSignedUp(event: any) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload.email });
	}
}

class ProvisionTrialSaga extends AbstractSaga {
	static get startsWith() {
		return ['userSignedUp'];
	}
	static get handles() {
		return ['trialProvisioned'];
	}
	userSignedUp(event: any) {
		this.enqueue('provisionTrial', undefined, { email: event.payload.email });
	}
	trialProvisioned(event: any) {
		this.enqueue('sendWelcomeEmail', undefined, {
			email: event.payload.email,
			reason: 'trialProvisioned'
		});
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

	let welcomeEmailCount = 0;
	let resolveAllWelcomeEmails: (() => void) | undefined;
	const allWelcomeEmails = new Promise<void>(resolve => {
		resolveAllWelcomeEmails = resolve;
	});

	eventStore.on('trialProvisioned', event => {
		console.log('trialProvisioned event:', event);
		return [];
	});

	// Log saga-produced commands
	commandBus.on('sendWelcomeEmail', command => {
		welcomeEmailCount += 1;
		if (welcomeEmailCount >= 2)
			resolveAllWelcomeEmails?.();

		console.log('sendWelcomeEmail command:', command);
		return [];
	});

	// Wire aggregate handler
	SignupAggregate.register(eventStore, commandBus);

	// Provisioning is handled by a different aggregate that emits events, which the saga then handles again
	TrialAggregate.register(eventStore, commandBus);

	// Wire multiple saga handlers that start from the same event type
	WelcomeEmailSaga.register(eventStore, commandBus);
	ProvisionTrialSaga.register(eventStore, commandBus);

	const [userSignedUp] = await commandBus.send('signupUser', undefined, {
		payload: { email: 'john@example.com' } satisfies SignupUserPayload
	});

	console.log('userSignedUp event (starter id used as saga origin):', userSignedUp);

	// wait for the multi-step saga to emit the follow-up command after trial provisioning
	await allWelcomeEmails;
}

await main();
