'use strict';

const { Container, InMemoryEventStorage } = require('../..'); // node-cqrs
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
