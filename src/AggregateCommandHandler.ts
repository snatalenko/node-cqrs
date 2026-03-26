import type { Tracer } from '@opentelemetry/api';
import {
	assertBoolean, assertDefined, assertMessage, assertNonNegativeInteger, assertObservable, assertStringArray,
	Lock, MapAssertable
} from './utils/index.ts';
import { recordSpanError, spanAttributes, spanContext } from './telemetry/index.ts';
import { ConcurrencyError } from './errors/index.ts';
import type {
	AggregateEventsQueryParams,
	IAggregate,
	IAggregateConstructor,
	IAggregateFactory,
	ICommand,
	ICommandHandler,
	IContainer,
	Identifier,
	IEventSet,
	IEventStore,
	ILocker,
	ILogger,
	IMessageMeta,
	IObservable,
	RetryOnConcurrencyErrorDecision,
	RetryOnConcurrencyErrorOptions,
	RetryOnConcurrencyErrorResolver
} from './interfaces/index.ts';
import { isObject } from './interfaces/isObject.ts';

const DEFAULT_MAX_RETRY_ATTEMPTS = 5;

function normalizeRetryResolver(value?: RetryOnConcurrencyErrorOptions): RetryOnConcurrencyErrorResolver {
	if (typeof value === 'function')
		return value;
	if (value === false)
		return () => false;
	if (value === 'ignore')
		return err => (err instanceof ConcurrencyError ? 'ignore' : false);
	if (typeof value === 'number')
		return (err, events, attempt) => err instanceof ConcurrencyError && attempt < value;

	if (isObject(value)) {
		const { maxRetries = DEFAULT_MAX_RETRY_ATTEMPTS, ignoreAfterMaxRetries = false } = value;
		assertNonNegativeInteger(maxRetries, 'retryOnConcurrencyError.maxRetries');
		assertBoolean(ignoreAfterMaxRetries, 'retryOnConcurrencyError.ignoreAfterMaxRetries');

		return (err, events, attempt): RetryOnConcurrencyErrorDecision => {
			if (!(err instanceof ConcurrencyError))
				return false;

			if (attempt < maxRetries)
				return true;

			return ignoreAfterMaxRetries ? 'ignore' : false;
		};
	}

	// undefined or true — default behavior
	return (err, events, attempt) =>
		err instanceof ConcurrencyError && attempt < DEFAULT_MAX_RETRY_ATTEMPTS;
}

/**
 * Aggregate command handler.
 *
 * Subscribes to event store and awaits aggregate commands.
 * Upon command receiving creates an instance of aggregate,
 * restores its state, passes command and commits emitted events to event store.
 */
export class AggregateCommandHandler<TAggregate extends IAggregate> implements ICommandHandler {

	readonly #eventStore: IEventStore;
	readonly #logger?: ILogger;
	readonly #aggregateFactory: IAggregateFactory<TAggregate, any>;
	readonly #handles: Readonly<string[]>;
	readonly #restoresFrom?: Readonly<string[]>;
	readonly #shouldRetry: RetryOnConcurrencyErrorResolver;
	readonly #tracer: Tracer | undefined;

	/** Aggregate instances cache for concurrent command handling */
	readonly #aggregatesCache: MapAssertable<Identifier, Promise<TAggregate>> = new MapAssertable();

	/** Lock for sequential aggregate command execution */
	readonly #executionLock: ILocker;

	constructor({
		eventStore,
		aggregateType,
		aggregateFactory,
		handles,
		executionLocker = new Lock(),
		restoresFrom,
		retryOnConcurrencyError,
		tracerFactory,
		logger
	}: Pick<IContainer, 'eventStore' | 'executionLocker' | 'logger' | 'tracerFactory'> & {
		aggregateType?: IAggregateConstructor<TAggregate, any>,
		aggregateFactory?: IAggregateFactory<TAggregate, any>,
		handles?: Readonly<string[]>,
		restoresFrom?: Readonly<string[]>,
		retryOnConcurrencyError?: RetryOnConcurrencyErrorOptions
	}) {
		assertDefined(eventStore, 'eventStore');

		this.#eventStore = eventStore;
		this.#executionLock = executionLocker;
		this.#logger = logger && 'child' in logger ?
			logger.child({ service: new.target.name }) :
			logger;

		if (aggregateType) {
			const AggregateType = aggregateType;
			this.#aggregateFactory = params => new AggregateType(params);
			this.#handles = AggregateType.handles;
			this.#restoresFrom = AggregateType.restoresFrom;
			this.#shouldRetry = normalizeRetryResolver(retryOnConcurrencyError ??
				AggregateType.retryOnConcurrencyError);
			this.#tracer = tracerFactory?.(new.target.name);
		}
		else if (aggregateFactory) {
			assertStringArray(handles, 'handles');

			this.#aggregateFactory = aggregateFactory;
			this.#handles = handles;
			this.#restoresFrom = restoresFrom;
			this.#shouldRetry = normalizeRetryResolver(retryOnConcurrencyError);
			this.#tracer = tracerFactory?.(new.target.name);
		}
		else {
			throw new TypeError('either aggregateType or aggregateFactory is required');
		}
	}

	/** Subscribe to all command types handled by aggregateType */
	subscribe(commandBus: IObservable) {
		assertObservable(commandBus, 'commandBus');

		for (const commandType of this.#handles)
			commandBus.on(commandType, (cmd: ICommand, meta?: IMessageMeta) => this.execute(cmd, meta));
	}

	/** Restore aggregate from event store events */
	async #restoreAggregate(id: Identifier): Promise<TAggregate> {
		assertDefined(id, 'id');

		const aggregate = this.#aggregateFactory({ id });

		const queryOptions = this.#restoresFrom?.length ?
			{ eventTypes: this.#restoresFrom, tail: 'last' } satisfies AggregateEventsQueryParams :
			undefined;

		const eventsIterable = this.#eventStore.getAggregateEvents(id, queryOptions);

		let eventCount = 0;
		for await (const event of eventsIterable) {
			aggregate.mutate(event);
			eventCount += 1;
		}

		this.#logger?.info(`${aggregate} state restored from ${eventCount} event(s)`);

		return aggregate;
	}

	/** Create new aggregate with new Id generated by event store */
	async #createAggregate(): Promise<TAggregate> {
		const id = await this.#eventStore.getNewId();
		const aggregate = this.#aggregateFactory({ id });
		this.#logger?.info(`${aggregate} created`);

		return aggregate;
	}

	/**
	 * Register interest in the cache entry before acquiring the lock, so concurrent callers for the same aggregateId
	 * share one restoration promise instead of each triggering a separate event-store read
	 */
	#allocateCacheEntry(aggregateId: Identifier | undefined) {
		if (aggregateId)
			this.#aggregatesCache.assert(aggregateId, () => this.#restoreAggregate(aggregateId));
	}

	/**
	 * Replace the dirty cache entry with a lazy restoration factory
	 * so both the retry and any commands queued on the lock start from a clean state.
	 * The actual restore is deferred until the entry is awaited,
	 * avoiding orphaned resources when the entry is released before consumption.
	 */
	#resetCacheEntry(aggregateId: Identifier | undefined) {
		if (aggregateId)
			this.#aggregatesCache.setLazy(aggregateId, () => this.#restoreAggregate(aggregateId));
	}

	/**
	 * Decrement the usage counter registered above;
	 * deletes the entry when the last concurrent caller for this aggregateId is done.
	 */
	#releaseCacheEntry(aggregateId: Identifier | undefined) {
		if (aggregateId)
			this.#aggregatesCache.release(aggregateId);
	}

	/** Pass a command to corresponding aggregate */
	async execute(cmd: ICommand, meta?: IMessageMeta): Promise<IEventSet> {
		assertMessage(cmd, 'cmd');

		const { aggregateId } = cmd;

		const otelSpan = this.#tracer?.startSpan(`AggregateCommandHandler.execute ${cmd.type}`,
			spanAttributes('aggregate', cmd, ['type', 'aggregateId']),
			spanContext(meta)
		);

		this.#allocateCacheEntry(aggregateId);

		// Serialize execution per aggregate — commands for the same id queue here.
		const lease = aggregateId ?
			await this.#executionLock.acquire(String(aggregateId)) :
			undefined;

		try {
			for (let attempt = 0; ; attempt++) {
				// Read the current cache entry after acquiring the lock. On the first attempt
				// this is the pre-warmed (possibly shared) instance; on retries it is the
				// fresh instance placed into the cache by the error handler below.
				const aggregate = aggregateId ?
					await this.#aggregatesCache.get(aggregateId)! :
					await this.#createAggregate();

				let events: IEventSet;
				try {
					events = await aggregate.handle(cmd);

					this.#logger?.info(`${aggregate} "${cmd.type}" command processed, ${events.length} event(s) produced`);
				}
				catch (error: unknown) {
					this.#resetCacheEntry(aggregateId);
					throw error;
				}

				try {
					if (events.length)
						await this.#eventStore.dispatch(events, { otelSpan });

					return events;
				}
				catch (error: unknown) {
					this.#resetCacheEntry(aggregateId);

					const retryDecision = this.#shouldRetry(error, events, attempt);
					if (!retryDecision)
						throw error;

					if (retryDecision === 'ignore') {
						this.#logger?.warn(`"${cmd.type}" command error ignored after ${attempt + 1} attempt(s), force-dispatching`, { error });
						if (events.length) {
							const dispatchMeta = { ignoreConcurrencyError: true, otelSpan };
							await this.#eventStore.dispatch(events, dispatchMeta);
						}

						return events;
					}

					this.#logger?.warn(`"${cmd.type}" command failed on attempt ${attempt + 1}, will retry`, { error });
				}
			}
		}
		catch (error: any) {
			recordSpanError(otelSpan, error);
			throw error;
		}
		finally {
			otelSpan?.end();
			lease?.release();

			this.#releaseCacheEntry(aggregateId);
		}
	}
}
