'use strict';

const {
	ContainerBuilder,
	InMemoryEventStorage,
	CommandBus,
	EventStore,
	AggregateCommandHandler,
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

	// register infrastructure services;
	// eventStorageWriter and snapshotStorage are automatically added to the event dispatch pipeline
	// if they implement IDispatchPipelineProcessor interface (see src/CqrsContainerBuilder.ts)
	builder.register(InMemoryEventStorage).as('eventStorageReader').as('eventStorageWriter');
	builder.register(InMemorySnapshotStorage).as('snapshotStorage');
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

	/** @type {import('node-cqrs').IAggregateConstructor} */
	const aggregateType = UserAggregate;

	/** @type {import('node-cqrs').ICommandHandler} */
	const userCommandHandler = new AggregateCommandHandler({ eventStore, aggregateType });
	userCommandHandler.subscribe(commandBus);

	/** @type {import('node-cqrs').IProjection} */
	const usersProjection = new UsersProjection();
	usersProjection.subscribe(eventStore);

	return {
		eventStore,
		commandBus,
		users: usersProjection.view
	};
};
