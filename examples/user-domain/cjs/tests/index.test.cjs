'use strict';

const { createContainer, createBaseInstances } = require('../index.cjs');

describe('user-domain example', () => {

	const testEventFlow = async container => {

		const { commandBus, eventStore } = container;

		// we send a command to an aggregate that does not exist yet (userAggregateId = undefined),
		// a new instance will be created automatically
		let userAggregateId;

		// send(..) returns a promise, but we'll await for an eventStore event
		commandBus.send('createUser', userAggregateId, {
			payload: {
				username: 'sherlock',
				password: 'magic'
			}
		});

		const userCreatedEvent = await eventStore.once('userCreated');

		expect(userCreatedEvent).toHaveProperty('aggregateId');
		expect(userCreatedEvent.aggregateId).not.toBeUndefined();
		expect(userCreatedEvent).toHaveProperty('aggregateVersion', 0);
		expect(userCreatedEvent).toHaveProperty('type', 'userCreated');
		expect(userCreatedEvent).toHaveProperty('payload.username', 'sherlock');
		expect(userCreatedEvent).toHaveProperty('payload.passwordHash');
		expect(userCreatedEvent.payload.passwordHash).not.toBe('magic');

		// created user aggregateId can be retrieved from "userCreated" event
		userAggregateId = userCreatedEvent.aggregateId;

		commandBus.send('changeUserPassword', userAggregateId, {
			payload: {
				oldPassword: 'magic',
				password: 'no-magic'
			}
		});

		const userPasswordChanged = await eventStore.once('userPasswordChanged');

		expect(userPasswordChanged).toHaveProperty('aggregateId', userAggregateId);
		expect(userPasswordChanged).toHaveProperty('aggregateVersion', 1);
		expect(userPasswordChanged).toHaveProperty('type', 'userPasswordChanged');
		expect(userPasswordChanged).toHaveProperty('payload.passwordHash');
		expect(userPasswordChanged.payload.passwordHash).not.toBe('no-magic');
	};

	const testProjection = async container => {

		const { commandBus, eventStore, users } = container;

		const userCreatedPromise = eventStore.once('userCreated');

		await commandBus.send('createUser', undefined, {
			payload: {
				username: 'sherlock',
				password: 'test'
			}
		});

		const userCreated = await userCreatedPromise;

		const viewRecord = await users.get(userCreated.aggregateId);

		expect(viewRecord).toBeDefined();
		expect(viewRecord).toHaveProperty('username', 'sherlock');
	};

	describe('with DI container', () => {

		it('handles user aggregate commands, emits events',
			() => testEventFlow(createContainer()));

		it('updates Users projection view',
			() => testProjection(createContainer()));
	});

	describe('with manual instantiation', () => {

		it('handles user aggregate commands, emits events', () =>
			testEventFlow(createBaseInstances()));

		it('updates Users projection view', () =>
			testProjection(createBaseInstances()));
	});
});
