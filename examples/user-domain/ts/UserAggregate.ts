import { AbstractAggregate } from '../../../src/index.ts';
import { md5 } from './utils.ts';
import type {
	ChangePasswordCommandPayload,
	CreateUserCommandPayload,
	PasswordChangedEvent,
	UserCreatedEvent
} from './messages.ts';

class UserAggregateState {
	passwordHash!: string;

	userCreated(event: UserCreatedEvent) {
		this.passwordHash = event.payload!.passwordHash;
	}

	passwordChanged(event: PasswordChangedEvent) {
		this.passwordHash = event.payload!.passwordHash;
	}
}

export class UserAggregate extends AbstractAggregate<UserAggregateState> {

	protected readonly state = new UserAggregateState();

	createUser(payload: CreateUserCommandPayload) {
		this.emit('userCreated', {
			username: payload.username,
			passwordHash: md5(payload.password)
		});
	}

	changePassword(payload: ChangePasswordCommandPayload) {
		if (md5(payload.oldPassword) !== this.state.passwordHash)
			throw new Error('Invalid password');

		this.emit('passwordChanged', {
			passwordHash: md5(payload.newPassword)
		});
	}
}
