'use strict';

import {
	IAggregate,
	IAggregateConstructor,
	IAggregateFactory,
	ICommand,
	ICommandBus,
	ICommandHandler,
	Identifier,
	IEventStore,
	IEventStream,
	IExtendableLogger,
	ILogger,
	ISnapshotStorage
} from "./interfaces";


import { getClassName, getHandledMessageTypes, readEventsFromIterator } from './utils';
import subscribe from './subscribe';

/**
 * Aggregate command handler.
 *
 * Subscribes to event store and awaits aggregate commands.
 * Upon command receiving creates an instance of aggregate,
 * restores its state, passes command and commits emitted events to event store.
 */
export default class AggregateCommandHandler implements ICommandHandler {

	#eventStore: IEventStore;
	#snapshotStorage?: ISnapshotStorage;
	#logger?: ILogger;

	#aggregateFactory: IAggregateFactory<any>;
	#handles: string[];

	/**
	 * Creates an instance of AggregateCommandHandler.
	 */
	constructor({
		eventStore,
		snapshotStorage,
		aggregateType,
		aggregateFactory,
		handles,
		logger
	}: {
		eventStore: IEventStore,
		snapshotStorage?: ISnapshotStorage,
		aggregateType?: IAggregateConstructor<any>,
		aggregateFactory?: IAggregateFactory<any>,
		handles?: string[],
		logger?: ILogger | IExtendableLogger
	}) {
		if (!eventStore)
			throw new TypeError('eventStore argument required');

		this.#eventStore = eventStore;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;
		this.#snapshotStorage = snapshotStorage;

		if (aggregateType) {
			const AggregateType = aggregateType;
			this.#aggregateFactory = params => new AggregateType(params);
			this.#handles = getHandledMessageTypes(AggregateType);
		}
		else if (aggregateFactory) {
			if (!Array.isArray(handles) || !handles.length)
				throw new TypeError('handles argument must be an non-empty Array');

			this.#aggregateFactory = aggregateFactory;
			this.#handles = handles;
		}
		else {
			throw new TypeError('either aggregateType or aggregateFactory is required');
		}
	}

	/**
	 * Subscribe to all command types handled by aggregateType
	 */
	subscribe(commandBus: ICommandBus) {
		subscribe(commandBus, this, {
			messageTypes: this.#handles,
			masterHandler: (c: ICommand) => this.execute(c)
		});
	}

	/**
	 * Restore aggregate from event store events
	 */
	private async _restoreAggregate(id: Identifier): Promise<IAggregate> {
		const snapshot = this.#snapshotStorage ? await this.#snapshotStorage.getSnapshot(id) : undefined;
		const eventsFilter = snapshot && { afterEvent: snapshot.lastEvent };
		const events = await readEventsFromIterator(this.#eventStore.getStream(id, eventsFilter));

		const aggregate = this.#aggregateFactory({ id, snapshot, events });

		this.#logger?.info(`${aggregate} state restored from ${events.length} event(s)`);

		return aggregate;
	}

	/**
	 * Create new aggregate with new Id generated by event store
	 */
	private async _createAggregate(): Promise<IAggregate> {
		const id = await this.#eventStore.getNewId();
		const aggregate = this.#aggregateFactory({ id });
		this.#logger?.info(`${aggregate} created`);

		return aggregate;
	}

	/**
	 * Pass a command to corresponding aggregate
	 */
	async execute(cmd: ICommand): Promise<IEventStream> {
		if (!cmd) throw new TypeError('cmd argument required');
		if (!cmd.type) throw new TypeError('cmd.type argument required');

		const aggregate = cmd.aggregateId ?
			await this._restoreAggregate(cmd.aggregateId) :
			await this._createAggregate();

		await aggregate.handle(cmd);

		const events = aggregate.changes;
		this.#logger?.info(`${aggregate} "${cmd.type}" command processed, ${events.length} event(s) produced`);
		if (!events.length)
			return events;

		await this.#eventStore.commit(aggregate.id, events);

		if (this.#snapshotStorage && aggregate.shouldTakeSnapshot)
			this._saveAggregateSnapshot(aggregate);

		return events;
	}

	protected async _saveAggregateSnapshot(aggregate: IAggregate): Promise<void> {
		if (!this.#snapshotStorage)
			throw new TypeError('snapshotStorage dependency is not set up');
		if (typeof aggregate.makeSnapshot !== 'function')
			throw new TypeError('aggregate.makeSnapshot must be a Function');

		const snapshot = aggregate.makeSnapshot();

		await this.#snapshotStorage.saveSnapshot(aggregate.id, snapshot);
	}
}
