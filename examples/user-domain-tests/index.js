'use strict';

const { expect } = require('chai');
const { createContainer } = require('../../examples/user-domain');

describe('user-domain example', () => {

	let container;
	beforeEach(() => {
		container = createContainer();
	});

	it('handles user aggregate commands, emits events', async () => {

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

		expect(userCreatedEvent).to.have.property('aggregateId').that.is.not.undefined;
		expect(userCreatedEvent).to.have.property('aggregateVersion', 0);
		expect(userCreatedEvent).to.have.property('type', 'userCreated');
		expect(userCreatedEvent).to.have.nested.property('payload.username', 'sherlock');
		expect(userCreatedEvent).to.have.nested.property('payload.passwordHash').that.does.not.eq('magic');

		// created user aggregateId can be retrieved from "userCreated" event
		userAggregateId = userCreatedEvent.aggregateId;

		commandBus.send('changeUserPassword', userAggregateId, {
			payload: {
				oldPassword: 'magic',
				password: 'no-magic'
			}
		});

		const userPasswordChanged = await eventStore.once('userPasswordChanged');

		expect(userPasswordChanged).to.have.property('aggregateId', userAggregateId);
		expect(userPasswordChanged).to.have.property('aggregateVersion', 1);
		expect(userPasswordChanged).to.have.property('type', 'userPasswordChanged');
		expect(userPasswordChanged).to.have.nested.property('payload.passwordHash').that.does.not.eq('no-magic');
	});

	it('updates Users projection view', async () => {

		const { commandBus, eventStore, users } = container;

		commandBus.send('createUser', undefined, {
			payload: {
				username: 'sherlock',
				password: 'test'
			}
		});

		const userCreated = await eventStore.once('userCreated');

		const viewRecord = await users.get(userCreated.aggregateId);

		expect(viewRecord).to.exist;
		expect(viewRecord).to.have.property('username', 'sherlock');
	});
});
