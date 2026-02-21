'use strict';

const {
	ContainerBuilder,
	InMemoryEventStorage,
	CommandBus,
	EventStore,
	InMemoryMessageBus,
	EventDispatcher,
	InMemorySnapshotStorage
} = require('node-cqrs');
const UserAggregate = require('./UserAggregate.cjs');
const UsersProjection = require('./UsersProjection.cjs');

/**
 * DI container factory
 */
exports.createContainer = () => {
	const builder = new ContainerBuilder();

	// auto-resolved as eventStorageReader, eventStorageWriter, and identifierProvider
	builder.register(InMemoryEventStorage);

	// auto-resolved as snapshotStorage
	builder.register(InMemorySnapshotStorage);

	// register domain entities
	builder.registerAggregate(UserAggregate);
	builder.registerProjection(UsersProjection, 'users');

	// create instances of command/event handlers and related subscriptions
	return builder.container();
};

/**
 * Same as above, but without the DI container
 */
exports.createBaseInstances = () => {
	// create infrastructure services
	const eventBus = new InMemoryMessageBus();
	const storage = new InMemoryEventStorage();
	const eventDispatcher = new EventDispatcher({ eventBus })
	eventDispatcher.addPipelineProcessor(storage);

	const eventStore = new EventStore({ eventStorageReader: storage, eventBus, eventDispatcher });
	const commandBus = new CommandBus();

	UserAggregate.register(eventStore, commandBus);

	/** @type {import('node-cqrs').IProjection} */
	const usersProjection = new UsersProjection();
	usersProjection.subscribe(eventStore);

	return {
		eventStore,
		commandBus,
		users: usersProjection.view
	};
};

// Run as a standalone example script
if (require.main === module) {
	(async () => {
		const { commandBus, users } = exports.createBaseInstances();

		const [userCreated] = await commandBus.send('createUser', undefined, {
			payload: {
				username: 'john',
				password: 'magic'
			}
		});

		await commandBus.send('changeUserPassword', userCreated.aggregateId, {
			payload: {
				oldPassword: 'magic',
				password: 'no magic'
			}
		});

		const user = await users.get(userCreated.aggregateId);
		console.log(user);
	})().catch(err => {
		console.error(err);
		process.exitCode = 1;
	});
}
