/**
 * Plain user domain implementation example without using the framework classes.
 *
 * - `UserAggregate` implementing write model
 * - `UserProjection` implementing read model
 * - In-memory `EventStore`
 * - `CommandHandler`
 * - Main function wiring everything together and sending test commands
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import type {
	IAggregate, ICommand, ICommandHandler, Identifier, IEvent, IEventSet, IEventStorageReader, IEventStorageWriter,
	IObservable, IProjection
} from '../../types';

const md5 = (v: string): string => crypto.createHash('md5').update(v).digest('hex');

/**
 * Sample aggregate (write interface)
 */
class UserAggregate implements IAggregate {

	readonly id: any;

	/* inner aggregate state used for write operation validation */
	#state: { passwordHash?: string } = {};

	constructor(id) {
		this.id = id;
	}

	/** Restore aggregate state from past events */
	mutate(event: IEvent): void {
		if (event.type === 'userCreated' || event.type === 'userPasswordChanged')
			this.#state.passwordHash = event.payload.passwordHash;
	}

	/** Redirect command execution to a command handler */
	handle(command: ICommand): IEventSet {
		return this[command.type](command.payload);
	}

	createUser({ username, password }): IEventSet {
		return [{
			type: 'userCreated',
			aggregateId: this.id,
			payload: {
				username,
				passwordHash: md5(password)
			}
		}];
	}

	changePassword({ oldPassword, newPassword }): IEventSet {
		if (md5(oldPassword) !== this.#state.passwordHash)
			throw new Error('Old password is incorrect');

		return [{
			type: 'userPasswordChanged',
			aggregateId: this.id,
			payload: {
				passwordHash: md5(newPassword)
			}
		}];
	}
}

/**
 * Sample projection (read model)
 */
class UserProjection implements IProjection<Map<string, { username: string }>> {

	/** View model */
	readonly view: Map<string, { username: string; }> = new Map();

	/** Subscribe only to the event types that affect the read model */
	subscribe(eventStore: IObservable) {
		eventStore.on('userCreated', e => this.userCreated(e.aggregateId, e.payload));
	}

	/** If the view is not persistent, restore it from past events */
	async restore(eventStore: IEventStorageReader) {
		for await (const oldEvent of eventStore.getEventsByTypes(['userCreated']))
			this.project(oldEvent);
	}

	/** Pass data to corresponding event handler */
	project(event: IEvent): void {
		this[event.type](event.aggregateId, event.payload);
	}

	userCreated(userId, { username }) {
		this.view.set(userId, { username });
	}
}

/**
 * Dumb event store that keeps all events in memory
 * and re-distributes them to all subscribers
 */
class EventStore extends EventEmitter implements IObservable, IEventStorageReader, IEventStorageWriter {

	#events: IEvent[] = [];

	async commitEvents(events: Readonly<IEvent[]>) {
		this.#events.push(...events);

		for (const e of events)
			this.emit(e.type, e);

		return events;
	}

	async* getEventsByTypes(eventTypes: string[]) {
		yield* this.#events.filter(e => eventTypes.includes(e.type));
	}

	async* getAggregateEvents(aggregateId: Identifier) {
		yield* this.#events.filter(e => e.aggregateId === aggregateId);
	}

	async* getSagaEvents(sagaId: Identifier) {
		yield* this.#events.filter(e => e.sagaId === sagaId);
	}
}

/**
 * Sample command handler that routes commands to corresponding aggregates
 */
class CommandHandler implements ICommandHandler {

	#eventStore: IEventStorageReader & IEventStorageWriter;

	constructor(eventStore) {
		this.#eventStore = eventStore;
	}

	subscribe(commandBus: IObservable): void {
		commandBus.on('createUser', cmd => this.passCommandToAggregate(cmd));
		commandBus.on('changePassword', cmd => this.passCommandToAggregate(cmd));
	}

	async passCommandToAggregate(cmd) {
		const userAggregate = new UserAggregate(cmd.aggregateId);

		// restore aggregate state from past events
		const oldEvents = this.#eventStore.getAggregateEvents(cmd.aggregateId);
		for await (const event of oldEvents)
			userAggregate.mutate(event);

		// store new events
		const newEvents = userAggregate.handle(cmd);
		this.#eventStore.commitEvents(newEvents);
	}
}

/**
 * Run the test
 */
(async function main() {

	// create and wire all instances together

	const commandBus = new EventEmitter();
	const eventStore = new EventStore();

	const commandHandler = new CommandHandler(eventStore);
	commandHandler.subscribe(commandBus);

	const projection = new UserProjection();
	projection.subscribe(eventStore);
	projection.restore(eventStore);

	// send test commands

	commandBus.emit('createUser', {
		aggregateId: '1',
		type: 'createUser',
		payload: { username: 'John', password: 'magic' }
	});

	commandBus.emit('changeUserPassword', {
		aggregateId: '1',
		type: 'changeUserPassword',
		payload: { oldPassword: 'magic', newPassword: 'no magic' }
	});

	// wait for the command bus to finish processing
	await new Promise(setImmediate);

	const userRecord = projection.view.get('1');

	// eslint-disable-next-line no-console
	console.log(userRecord); // { username: 'John' }

}());
