import { AbstractSaga } from '../../src/index.ts';
import type { UserCreatedEvent } from '../user-domain-ts/messages.ts';

export class WelcomeEmailSaga extends AbstractSaga {
	userCreated(event: UserCreatedEvent) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload!.username });
	}
}
