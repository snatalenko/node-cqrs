'use strict';

const {
	Container,
	InMemoryEventStorage,
	CommandBus,
	EventStore,
	AggregateCommandHandler
} = require('../../src'); // node-cqrs
const UserAggregate = require('./UserAggregate');
const UsersProjection = require('./UsersProjection');

/**
 * DI container factory
 *
 * @returns {Container}
 */
exports.createContainer = () => {
	const container = new Container();

	// register infrastructure services
	container.register(InMemoryEventStorage, 'storage');

	// register domain entities
	container.registerAggregate(UserAggregate);
	container.registerProjection(UsersProjection, 'users');

	// create instances of command/event handlers and related subscriptions
	container.createUnexposedInstances();

	return container;
};

/**
 * Same as above, but without the DI container
 */
exports.createBaseInstances = () => {
	// create infrastructure services
	const storage = new InMemoryEventStorage();
	const eventStore = new EventStore({ storage });
	const commandBus = new CommandBus();

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
