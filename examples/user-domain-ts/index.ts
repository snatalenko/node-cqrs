import { ContainerBuilder, type IContainer, InMemoryEventStorage } from 'node-cqrs';
import type { ChangePasswordCommandPayload, CreateUserCommandPayload } from './messages.ts';
import { UserAggregate } from './UserAggregate.ts';
import { UsersProjection, type UsersView } from './UsersProjection.ts';

interface MyDiContainer extends IContainer {
	users: UsersView;
}

const builder = new ContainerBuilder<MyDiContainer>();
builder.register(InMemoryEventStorage) // In-memory implementations for local dev/tests
	.as('eventStorageReader')
	.as('eventStorageWriter');
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'users');


(async function main() {
	const container = builder.container();
	const { users, commandBus } = container;

	const [userCreated] = await commandBus.send('createUser', undefined, {
		payload: {
			username: 'john',
			password: 'magic'
		} satisfies CreateUserCommandPayload
	});

	await commandBus.send('changePassword', userCreated.aggregateId as string, {
		payload: {
			oldPassword: 'magic',
			newPassword: 'no magic'
		} satisfies ChangePasswordCommandPayload
	});

	const user = users.get(userCreated.aggregateId as string);

	// eslint-disable-next-line no-console
	console.log(user); // { username: 'john' }
}());
