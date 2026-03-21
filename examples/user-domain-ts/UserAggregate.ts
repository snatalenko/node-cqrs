import { AbstractAggregate } from '../../src/index.ts';
import { md5 } from './utils.ts';
import type {
	ChangePasswordCommandPayload,
	CreateUserCommandPayload,
	RenameUserCommandPayload,
	PasswordChangedEvent,
	UserCreatedEvent,
	UserRenamedEvent
} from './messages.ts';

export class UserState {
	username!: string;
	passwordHash!: string;

	userCreated(event: UserCreatedEvent) {
		this.username = event.payload!.username;
		this.passwordHash = event.payload!.passwordHash;
	}

	passwordChanged(event: PasswordChangedEvent) {
		this.passwordHash = event.payload!.passwordHash;
	}

	userRenamed(event: UserRenamedEvent) {
		this.username = event.payload!.username;
	}
}

export class UserAggregate extends AbstractAggregate<UserState> {

	protected readonly state = new UserState();

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

	renameUser(payload: RenameUserCommandPayload) {
		if (payload.username === this.state.username)
			throw new Error(`Username is already '${payload.username}'`);

		this.emit('userRenamed', {
			username: payload.username
		});
	}
}
