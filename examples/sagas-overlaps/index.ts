import {
	EventIdAugmentor,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from '../../src/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload } from '../user-domain-ts/messages.ts';
import { TrialAggregate } from './TrialAggregate.ts';
import { WelcomeEmailSaga } from './WelcomeEmailSaga.ts';
import { ProvisionTrialSaga } from './ProvisionTrialSaga.ts';

async function main() {
	const commandBus = new InMemoryMessageBus();
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
