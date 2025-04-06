import {
	IAggregate,
	IAggregateConstructor,
	IAggregateFactory,
	ICommand,
	ICommandBus,
	ICommandHandler,
	IContainer,
	Identifier,
	IEventSet,
	IEventStore,
	IExtendableLogger,
	ILogger
} from "./interfaces";

import {
	iteratorToArray,
	getClassName,
	subscribe
} from './utils';

/**
 * Aggregate command handler.
 *
 * Subscribes to event store and awaits aggregate commands.
 * Upon command receiving creates an instance of aggregate,
 * restores its state, passes command and commits emitted events to event store.
 */
export class AggregateCommandHandler implements ICommandHandler {

	#eventStore: IEventStore;
	#logger?: ILogger;

	#aggregateFactory: IAggregateFactory<any>;
	#handles: string[];

	constructor({
		eventStore,
		aggregateType,
		aggregateFactory,
		handles,
		logger
	}: Pick<IContainer, 'eventStore' | 'logger'> & {
		aggregateType?: IAggregateConstructor<any>,
		aggregateFactory?: IAggregateFactory<any>,
		handles?: string[]
	}) {
		if (!eventStore)
			throw new TypeError('eventStore argument required');

		this.#eventStore = eventStore;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: getClassName(this) }) :
			logger;

		if (aggregateType) {
			const AggregateType = aggregateType;
			this.#aggregateFactory = params => new AggregateType(params);
			this.#handles = AggregateType.handles;
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

	/** Subscribe to all command types handled by aggregateType */
	subscribe(commandBus: ICommandBus) {
		subscribe(commandBus, this, {
			messageTypes: this.#handles,
			masterHandler: (c: ICommand) => this.execute(c)
		});
	}

	/** Restore aggregate from event store events */
	async #restoreAggregate(id: Identifier): Promise<IAggregate> {
		if (!id)
			throw new TypeError('id argument required');

		const eventsIterable = this.#eventStore.getAggregateEvents(id);
		const events = await iteratorToArray(eventsIterable);

		const aggregate = this.#aggregateFactory({ id, events });

		this.#logger?.info(`${aggregate} state restored from ${events.length} event(s)`);

		return aggregate;
	}

	/** Create new aggregate with new Id generated by event store */
	async #createAggregate(): Promise<IAggregate> {
		const id = await this.#eventStore.getNewId();
		const aggregate = this.#aggregateFactory({ id });
		this.#logger?.info(`${aggregate} created`);

		return aggregate;
	}

	/** Pass a command to corresponding aggregate */
	async execute(cmd: ICommand): Promise<IEventSet> {
		if (!cmd) throw new TypeError('cmd argument required');
		if (!cmd.type) throw new TypeError('cmd.type argument required');

		const aggregate = cmd.aggregateId ?
			await this.#restoreAggregate(cmd.aggregateId) :
			await this.#createAggregate();

		await aggregate.handle(cmd);

		let events = aggregate.changes;
		this.#logger?.info(`${aggregate} "${cmd.type}" command processed, ${events.length} event(s) produced`);
		if (!events.length)
			return events;

		if (aggregate.shouldTakeSnapshot) {
			aggregate.takeSnapshot();
			events = aggregate.changes;
		}

		await this.#eventStore.dispatch(events);

		return events;
	}
}
