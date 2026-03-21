import {
	AbstractAggregate,
	AbstractSaga,
	EventIdAugmentor,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from '../../src/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload, UserCreatedEvent } from '../user-domain-ts/messages.ts';

type ProvisionTrialPayload = { email: string };

class TrialAggregate extends AbstractAggregate<void> {
	provisionTrial(payload: ProvisionTrialPayload) {
		console.log('provisionTrial command (received by TrialAggregate):', this.command);
		this.emit('trialProvisioned', { email: payload.email });
	}
}

class WelcomeEmailSaga extends AbstractSaga {
	userCreated(event: UserCreatedEvent) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload!.username });
	}
}

class ProvisionTrialSaga extends AbstractSaga {
	userCreated(event: UserCreatedEvent) {
		this.enqueue('provisionTrial', undefined, { email: event.payload!.username });
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
		eventStorage,
		eventDispatchPipeline: [
			new EventIdAugmentor({ identifierProvider: eventStorage }),
			eventStorage
		],
		eventBus
	});

	const commandBus = new InMemoryMessageBus();

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
	UserAggregate.register(eventStore, commandBus);

	// Provisioning is handled by a different aggregate that emits events, which the saga then handles again
	TrialAggregate.register(eventStore, commandBus);

	// Wire multiple saga handlers that start from the same event type
	WelcomeEmailSaga.register(eventStore, commandBus);
	ProvisionTrialSaga.register(eventStore, commandBus);

	const [userCreated] = await commandBus.send('createUser', undefined, {
		payload: {
			username: 'john@example.com',
			password: 'magic'
		} satisfies CreateUserCommandPayload
	});

	console.log('userCreated event (starter id used as saga origin):', userCreated);

	// wait for the multi-step saga to emit the follow-up command after trial provisioning
	await allWelcomeEmails;
}

await main();
