/* eslint new-cap: "off" */
'use strict';

import { ICommandBus, IEvent, IEventReceptor, IEventStore, ILogger, IObservable, ISaga, ISagaConstructor, ISagaFactory } from "./interfaces";
import { getClassName, readEventsFromIterator } from './utils';
import subscribe from './subscribe';

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
export default class SagaEventHandler implements IEventReceptor {

	#eventStore: IEventStore;
	#commandBus: ICommandBus;
	#queueName?: string;
	#logger?: ILogger;
	#sagaFactory: (params: any) => ISaga;
	#startsWith: string[];
	#handles: string[];

	constructor(options: {
		sagaType?: ISagaConstructor,
		sagaFactory?: ISagaFactory,
		eventStore: IEventStore,
		commandBus: ICommandBus,
		logger?: ILogger,
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
		this.#logger = options.logger;

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
	}

	/**
	 * Overrides observer subscribe method
	 */
	subscribe(eventStore: IObservable) {
		subscribe(eventStore, this, {
			messageTypes: [...this.#startsWith, ...this.#handles],
			masterHandler: e => this.handle(e),
			queueName: this.#queueName
		});
	}

	/**
	 * Handle saga event
	 */
	async handle(event: IEvent): Promise<void> {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const isSagaStarterEvent = this.#startsWith.includes(event.type);
		const saga = isSagaStarterEvent ?
			await this._createSaga() :
			await this._restoreSaga(event);

		// append event to the saga stream
		this.#eventStore.commit(saga.id, [event]);

		const r = saga.apply(event);
		if (r instanceof Promise)
			await r;

		await this._sendCommands(saga, event);

		// additional commands can be added by the saga.onError handler
		if (saga.uncommittedMessages.length)
			await this._sendCommands(saga, event);
	}

	private async _sendCommands(saga: ISaga, event: IEvent<any>) {
		const commands = saga.uncommittedMessages;
		saga.resetUncommittedMessages();

		this.#logger?.log('debug', `"${event.type}" event processed, ${commands.map(c => c.type).join(',') || 'no commands'} produced`, {
			service: getClassName(saga)
		});

		for (const command of commands) {

			// attach event context to produced command
			if (command.context === undefined && event.context !== undefined)
				command.context = event.context;

			try {
				await this.#commandBus.sendRaw(command);
			}
			catch (err) {
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

	/**
	 * Start new saga
	 */
	private async _createSaga(): Promise<ISaga> {
		const id = await this.#eventStore.getNewId();
		return this.#sagaFactory.call(null, { id });
	}

	/**
	 * Restore saga from event store
	 */
	private async _restoreSaga(event: IEvent): Promise<ISaga> {
		/* istanbul ignore if */
		if (!event.sagaId)
			throw new TypeError(`Event "${event.type}" of aggregate "${event.aggregateId}" does not contain sagaId`);

		const eventsIterator = await this.#eventStore.getStream(event.sagaId, { beforeEvent: event });
		const events = await readEventsFromIterator(eventsIterator);

		const saga = this.#sagaFactory.call(null, { id: event.sagaId, events });
		this.#logger?.log('info', `Saga state restored from ${events}`, { service: getClassName(saga) });

		return saga;
	}
}
