import * as Event from './Event.ts';
import type {
	ICommandBus,
	IContainer,
	Identifier,
	IEvent,
	IEventReceptor,
	IEventStore,
	ILocker,
	ILogger,
	IObservable,
	ISaga,
	ISagaConstructor,
	ISagaFactory
} from './interfaces/index.ts';

import {
	subscribe,
	Lock,
	makeSagaId,
	MapAssertable,
	assertDefined,
	assertString,
	assertOptionalArray
} from './utils/index.ts';

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
export class SagaEventHandler implements IEventReceptor {

	readonly #eventStore: IEventStore;
	readonly #commandBus: ICommandBus;
	readonly #queueName?: string;
	readonly #logger?: ILogger;
	readonly #sagaFactory: (params: any) => ISaga;
	readonly #startsWith?: string[];
	readonly #handles: string[];
	readonly #sagaDescriptor: string;
	readonly #executionLock: ILocker;
	readonly #sagasCache: MapAssertable<Identifier, Promise<ISaga>> = new MapAssertable();

	constructor(options: Pick<IContainer, 'eventStore' | 'commandBus' | 'executionLocker' | 'logger'> & {
		sagaType?: ISagaConstructor,
		sagaFactory?: ISagaFactory,
		sagaDescriptor?: string,
		queueName?: string,
		startsWith?: string[],
		handles?: string[]
	}) {
		assertDefined(options, 'options');
		assertDefined(options.eventStore, 'options.eventStore');
		assertDefined(options.commandBus, 'options.commandBus');

		this.#eventStore = options.eventStore;
		this.#commandBus = options.commandBus;
		this.#queueName = options.queueName;
		this.#executionLock = options.executionLocker ?? new Lock();
		this.#logger = options.logger && 'child' in options.logger ?
			options.logger.child({ service: new.target.name }) :
			options.logger;

		if (options.sagaType) {
			const SagaType = options.sagaType as ISagaConstructor;

			this.#sagaFactory = params => new SagaType(params);
			this.#startsWith = SagaType.startsWith;
			this.#handles = SagaType.handles;
			this.#sagaDescriptor = SagaType.sagaDescriptor ?? SagaType.name;
		}
		else if (options.sagaFactory) {
			assertOptionalArray(options.handles, 'options.handles');
			assertString(options.sagaDescriptor, 'options.sagaDescriptor');

			this.#sagaFactory = options.sagaFactory;
			this.#startsWith = options.startsWith;
			this.#handles = options.handles;
			this.#sagaDescriptor = options.sagaDescriptor;
		}
		else {
			throw new Error('Either sagaType or sagaFactory is required');
		}
	}

	/** Overrides observer subscribe method */
	subscribe(eventStore: IObservable) {
		subscribe(eventStore, this, {
			messageTypes: [...this.#startsWith ?? [], ...this.#handles],
			masterHandler: this.handle,
			queueName: this.#queueName
		});
	}

	/** Handle saga event */
	async handle(event: IEvent): Promise<void> {
		assertDefined(event, 'event');
		assertDefined(event.type, 'event.type');
		assertString(event.id, 'event.id');

		const sagaOriginFromEvent = event.sagaOrigins?.[this.#sagaDescriptor];
		const isStarterEvent = this.#startsWith?.includes(event.type) ?? !sagaOriginFromEvent;
		if (isStarterEvent && sagaOriginFromEvent)
			throw new Error(`Starter event "${event.type}" already contains saga origin for "${this.#sagaDescriptor}"`);

		const sagaOrigin = isStarterEvent ? event.id : sagaOriginFromEvent;
		if (!sagaOrigin)
			throw new Error(`Event "${event.type}" does not contain saga origin for "${this.#sagaDescriptor}"`);

		const sagaId = makeSagaId(this.#sagaDescriptor, sagaOrigin);
		const saga = await this.#sagasCache.assert(sagaId, () => (isStarterEvent ?
			this.#createSaga(sagaId) :
			this.#restoreSaga(sagaId, event)
		));

		// multiple events to a same saga ID will execute sequentially on a same saga instance
		const lease = await this.#executionLock.acquire(sagaId);

		try {
			const commands = await saga.handle(event);
			this.#logger?.debug(`"${Event.describe(event)}" processed, ${commands.map(c => c.type).join(',') || 'no commands'} produced`);

			for (const command of commands) {
				// attach event context to produced command
				if (command.context === undefined && event.context !== undefined)
					command.context = event.context;

				if (command.sagaOrigins === undefined) {
					command.sagaOrigins = {
						...event.sagaOrigins,
						[this.#sagaDescriptor]: sagaOrigin
					};
				}

				await this.#commandBus.sendRaw(command);
			}
		}
		finally {
			lease.release();
			this.#sagasCache.release(sagaId);
		}
	}

	/** Start new saga */
	async #createSaga(id: Identifier): Promise<ISaga> {
		return this.#sagaFactory.call(null, { id });
	}

	/** Restore saga from event store */
	async #restoreSaga(id: Identifier, event: IEvent): Promise<ISaga> {
		const saga = this.#sagaFactory.call(null, { id });

		const eventsIterable = this.#eventStore.getSagaEvents(id, { beforeEvent: event });
		let eventsCount = 0;
		for await (const oldEvent of eventsIterable) {
			const r = saga.mutate(oldEvent);
			if (r instanceof Promise)
				await r;

			eventsCount += 1;
		}

		this.#logger?.info(`Saga state restored from ${eventsCount} event(s)`);

		return saga;
	}
}
