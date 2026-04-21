import { AbstractSaga } from '../../src/index.ts';
import type { UserCreatedEvent } from '../user-domain-ts/messages.ts';

export class ProvisionTrialSaga extends AbstractSaga {
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
