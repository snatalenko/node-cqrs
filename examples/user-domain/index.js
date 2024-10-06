'use strict';

const {
	ContainerBuilder,
	InMemoryEventStorage,
	CommandBus,
	EventStore,
	AggregateCommandHandler,
	InMemoryMessageBus
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
exports.createBaseInstances = () => {
	// create infrastructure services
	const messageBus = new InMemoryMessageBus();
	const storage = new InMemoryEventStorage();
	const eventStore = new EventStore({ storage, messageBus });
	const commandBus = new CommandBus({ messageBus });

	/** @type {IAggregateConstructor} */
	const aggregateType = UserAggregate;

	/** @type {ICommandHandler} */
	const userCommandHandler = new AggregateCommandHandler({ eventStore, aggregateType });
	userCommandHandler.subscribe(commandBus);

	/** @type {IProjection} */
	const usersProjection = new UsersProjection();
	usersProjection.subscribe(eventStore);

	return {
		eventStore,
		commandBus,
		users: usersProjection.view
	};
};
