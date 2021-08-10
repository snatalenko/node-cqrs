'use strict';

const {
	ContainerBuilder,
	InMemoryEventStorage,
	InMemoryMessageBus,
	CommandBus,
	EventStore,
	AggregateCommandHandler
} = require('../..'); // node-cqrs
const UserAggregate = require('./UserAggregate');
const UsersProjection = require('./UsersProjection');

/**
 * DI container factory
 */
exports.createContainer = () => {
	const builder = new ContainerBuilder();

	// register infrastructure services
	builder.register(InMemoryEventStorage).as('storage');
	builder.register(InMemoryMessageBus).as('messageBus');

	// register domain entities
	builder.registerAggregate(UserAggregate);
	builder.registerProjection(UsersProjection, 'users');

	// create instances of command/event handlers and related subscriptions
	return builder.container();
};

/**
 * Same as above, but without the DI container
 */
exports.createBaseInstances = async () => {
	// create infrastructure services
	const storage = new InMemoryEventStorage();
	const messageBus = new InMemoryMessageBus();
	const eventStore = new EventStore({ storage, messageBus });
	const commandBus = new CommandBus({ messageBus });

	const aggregateType = UserAggregate;
	const userCommandHandler = new AggregateCommandHandler({ eventStore, aggregateType });
	userCommandHandler.subscribe(commandBus);

	const usersProjection = new UsersProjection();
	await usersProjection.subscribe(eventStore);

	return {
		eventStore,
		commandBus,
		users: usersProjection.view
	};
};
