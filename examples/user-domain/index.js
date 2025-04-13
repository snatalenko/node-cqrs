'use strict';

const {
	ContainerBuilder,
	InMemoryEventStorage,
	CommandBus,
	EventStore,
	AggregateCommandHandler,
	InMemoryMessageBus,
	EventDispatcher
} = require('../..'); // node-cqrs
const UserAggregate = require('./UserAggregate');
const UsersProjection = require('./UsersProjection');

/**
 * DI container factory
 */
exports.createContainer = () => {
	const builder = new ContainerBuilder();

	// register infrastructure services
	builder.register(InMemoryEventStorage).as('eventStorageReader').as('eventStorageWriter');
	builder.register(InMemoryMessageBus).as('eventBus');

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

	/** @type {import('../..').IAggregateConstructor} */
	const aggregateType = UserAggregate;

	/** @type {import('../..').ICommandHandler} */
	const userCommandHandler = new AggregateCommandHandler({ eventStore, aggregateType });
	userCommandHandler.subscribe(commandBus);

	/** @type {import('../..').IProjection} */
	const usersProjection = new UsersProjection();
	usersProjection.subscribe(eventStore);

	return {
		eventStore,
		commandBus,
		users: usersProjection.view
	};
};
