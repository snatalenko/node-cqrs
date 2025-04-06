import * as Event from './Event';
import {
	ICommandBus,
	IContainer,
	IEvent,
	IEventReceptor,
	IEventStore,
	IExtendableLogger,
	ILogger,
	IObservable,
	ISaga,
	ISagaConstructor,
	ISagaFactory
} from './interfaces';

import {
	subscribe,
	getClassName,
	iteratorToArray
} from './utils';

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
export class SagaEventHandler implements IEventReceptor {

	#eventStore: IEventStore;
	#commandBus: ICommandBus;
	#queueName?: string;
	#logger?: ILogger;
	#sagaFactory: (params: any) => ISaga;
	#startsWith: string[];
	#handles: string[];

	constructor(options: Pick<IContainer, 'eventStore' | 'commandBus' | 'logger'> & {
		sagaType?: ISagaConstructor,
		sagaFactory?: ISagaFactory,
		queueName?: string,
		startsWith?: string[],
		handles?: string[]
	}) {
		if (!options)
			throw new TypeError('options argument required');
		if (!options.eventStore)
			throw new TypeError('options.eventStore argument required');
		if (!options.commandBus)
			throw new TypeError('options.commandBus argument required');

		this.#eventStore = options.eventStore;
		this.#commandBus = options.commandBus;
		this.#queueName = options.queueName;
		this.#logger = options.logger && 'child' in options.logger ?
			options.logger.child({ service: getClassName(this) }) :
			options.logger;

		if (options.sagaType) {
			const SagaType = options.sagaType as ISagaConstructor;

			this.#sagaFactory = params => new SagaType(params);
			this.#startsWith = SagaType.startsWith;
			this.#handles = SagaType.handles;
		}
		else if (options.sagaFactory) {
			if (!Array.isArray(options.startsWith))
				throw new TypeError('options.startsWith argument must be an Array');
			if (!Array.isArray(options.handles))
				throw new TypeError('options.handles argument must be an Array');

			this.#sagaFactory = options.sagaFactory;
			this.#startsWith = options.startsWith;
			this.#handles = options.handles;
		}
		else {
			throw new Error('Either sagaType or sagaFactory is required');
		}

		this.#eventStore.registerSagaStarters(options.startsWith);
	}

	/** Overrides observer subscribe method */
	subscribe(eventStore: IObservable) {
		subscribe(eventStore, this, {
			messageTypes: [...this.#startsWith, ...this.#handles],
			masterHandler: e => this.handle(e),
			queueName: this.#queueName
		});
	}

	/** Handle saga event */
	async handle(event: IEvent): Promise<void> {
		if (!event)
			throw new TypeError('event argument required');
		if (!event.type)
			throw new TypeError('event.type argument required');

		const isSagaStarterEvent = this.#startsWith.includes(event.type);
		const saga = isSagaStarterEvent ?
			await this.#createSaga() :
			await this.#restoreSaga(event);

		const r = saga.apply(event);
		if (r instanceof Promise)
			await r;

		await this.#sendCommands(saga, event);

		// additional commands can be added by the saga.onError handler
		if (saga.uncommittedMessages.length)
			await this.#sendCommands(saga, event);
	}

	async #sendCommands(saga: ISaga, event: IEvent<any>) {
		const commands = saga.uncommittedMessages;
		saga.resetUncommittedMessages();

		this.#logger?.debug(`"${Event.describe(event)}" processed, ${commands.map(c => c.type).join(',') || 'no commands'} produced`);

		for (const command of commands) {

			// attach event context to produced command
			if (command.context === undefined && event.context !== undefined)
				command.context = event.context;

			try {
				await this.#commandBus.sendRaw(command);
			}
			catch (err: any) {
				if (typeof saga.onError === 'function') {
					// let saga to handle the error
					saga.onError(err, { event, command });
				}
				else {
					throw err;
				}
			}
		}
	}

	/** Start new saga */
	async #createSaga(): Promise<ISaga> {
		const id = await this.#eventStore.getNewId();
		return this.#sagaFactory.call(null, { id });
	}

	/** Restore saga from event store */
	async #restoreSaga(event: IEvent): Promise<ISaga> {
		if (!event.sagaId)
			throw new TypeError(`${Event.describe(event)} does not contain sagaId`);

		const eventsIterable = this.#eventStore.getSagaEvents(event.sagaId, { beforeEvent: event });
		const events = await iteratorToArray(eventsIterable);

		const saga = this.#sagaFactory.call(null, { id: event.sagaId, events });
		this.#logger?.info(`Saga state restored from ${events.length} event(s)`);

		return saga;
	}
}
