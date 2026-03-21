import {
	type IContainer,
	ContainerBuilder,
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} from '../../../src/index.ts';
import type { ChangePasswordCommandPayload, CreateUserCommandPayload } from './messages.ts';
import { UserAggregate } from './UserAggregate.ts';
import { UsersProjection, type UsersView } from './UsersProjection.ts';

// Test with DI container
{
	interface MyDiContainer extends IContainer {
		users: UsersView;
	}

	const builder = new ContainerBuilder<MyDiContainer>();

	// auto-resolved as eventStorageReader, eventStorage, and identifierProvider
	builder.register(InMemoryEventStorage);

	builder.registerAggregate(UserAggregate);
	builder.registerProjection(UsersProjection, 'users');

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

	console.log(user); // { username: 'john' }
}


// Same test without DI container
{
	const inMemoryMessageBus = new InMemoryMessageBus();
	const eventStorage = new InMemoryEventStorage();
	const eventStore = new EventStore({
		eventStorageReader: eventStorage,
		identifierProvider: eventStorage,
		eventDispatchPipeline: [eventStorage],
		eventBus: inMemoryMessageBus
	});

	const commandBus = new InMemoryMessageBus();
	UserAggregate.register(eventStore, commandBus);

	const projection = new UsersProjection();
	await projection.subscribe(eventStore);
	const users = projection.view;


	const [userCreatedEvent] = await commandBus.send('createUser', undefined, {
		payload: {
			username: 'john',
			password: 'magic'
		} satisfies CreateUserCommandPayload
	});

	await commandBus.send('changePassword', userCreatedEvent.aggregateId as string, {
		payload: {
			oldPassword: 'magic',
			newPassword: 'no magic'
		} satisfies ChangePasswordCommandPayload
	});

	const user = await users.get(userCreatedEvent.aggregateId as string);

	console.log(user);
}
