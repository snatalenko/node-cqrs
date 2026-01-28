import {
	AbstractAggregate,
	AbstractProjection,
	ContainerBuilder,
	IContainer,
	IEvent,
	InMemoryEventStorage
} from '../..';
import * as crypto from 'crypto';
const md5 = (v: string): string => crypto.createHash('md5').update(v).digest('hex');

type CreateUserCommandPayload = { username: string, password: string };
type UserCreatedEventPayload = { username: string, passwordHash: string };

type ChangePasswordCommandPayload = { oldPassword: string, newPassword: string };
type PasswordChangedEventPayload = { passwordHash: string };

class UserAggregateState {
	passwordHash!: string;

	passwordChanged(event: IEvent<PasswordChangedEventPayload>) {
		this.passwordHash = event.payload!.passwordHash;
	}
}

class UserAggregate extends AbstractAggregate<UserAggregateState> {

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

type UsersView = Map<string, { username: string; }>;

class UsersProjection extends AbstractProjection<UsersView> {

	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: IEvent<UserCreatedEventPayload>) {
		this.view.set(event.aggregateId as string, {
			username: event.payload!.username
		});
	}
}

interface MyDiContainer extends IContainer {
	users: UsersView;
}

const builder = new ContainerBuilder<MyDiContainer>();

// In-memory implementations for local dev/tests
builder.register(InMemoryEventStorage)
	.as('eventStorageReader')
	.as('eventStorageWriter');
builder.register(() => console, 'logger');
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'users');

const container = builder.container();


(async function main() {

	const { users, commandBus } = container;

	const payload: CreateUserCommandPayload = {
		username: 'john',
		password: 'magic'
	};

	const [userCreated] = await commandBus.send('createUser', undefined, { payload });

	const user = users.get(userCreated.aggregateId as string);

	// eslint-disable-next-line no-console
	console.log(user); // { username: 'john' }
}());
