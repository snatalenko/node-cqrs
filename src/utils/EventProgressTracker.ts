import type { IEvent, IEventTracker, EventTrackerWaitOptions, Identifier } from '../interfaces/index.ts';
import { isIdentifier } from '../interfaces/Identifier.ts';
import { TimeoutError } from '../errors/index.ts';
import { assertEvent, assertFunction, assertIdentifier, assertNonNegativeInteger } from './assert.ts';
import { Deferred } from './Deferred.ts';

function assertPositiveInteger(value: unknown, argName: string): asserts value is number {
	assertNonNegativeInteger(value, argName);
	if (value === 0)
		throw new TypeError(`${argName} must be a positive Integer`);
}

/**
 * Returns IDs of the given events, which are marked as projected in a shared storage
 */
export type ProjectedEventIdsProvider = (eventIds: Identifier[]) => Promise<Iterable<Identifier>>;

export type EventProgressTrackerOptions = {

	/** Default wait timeout, in milliseconds. `0` disables the timeout */
	timeout?: number,

	/**
	 * Number of completed event IDs retained.
	 * Defaults to `0` when `projectedEventIdsProvider` is set, since the shared storage is checked instead.
	 */
	historySize?: number,

	/** Returns IDs of the given events, which are marked as projected in a shared storage */
	projectedEventIdsProvider?: ProjectedEventIdsProvider,

	/** Initial interval of shared storage polling, in milliseconds */
	pollInterval?: number,

	/** Maximum interval of shared storage polling, in milliseconds */
	maxPollInterval?: number
};

/**
 * Invokes `onExpire` with a TimeoutError once the timeout elapses (unless it is `0`),
 * or with the abort reason once the signal is aborted.
 * Returns a function, which stops watching.
 */
function watchDeadline(
	timeout: number,
	signal: AbortSignal | undefined,
	onExpire: (reason: unknown) => void
): () => void {
	const timer = timeout ?
		setTimeout(() => onExpire(new TimeoutError(`Timed out after ${timeout} ms`)), timeout) :
		undefined;
	const onAbort = () => onExpire(signal!.reason);
	signal?.addEventListener('abort', onAbort, { once: true });

	return () => {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	};
}

type Waiter = {

	/** Keys of the awaited events not completed yet */
	pending: Set<string>;
	deferred: Deferred<void>;
};

/**
 * Registry of projected events and their waiters, used by `IEventTracker` implementations.
 * Resolves `waitFor` calls once awaited events are marked as completed in the current process
 * or, when `projectedEventIdsProvider` is set, found projected in a shared storage by any process.
 *
 * Shared storage is checked once a wait is registered, then polled with an increasing interval
 * while there are pending waits.
 *
 * Without a projected event IDs provider, keeps a limited history of completed event IDs
 * to resolve waits for events completed before `waitFor` was called.
 * Failures are not retained, so events can be awaited again in case of redelivery.
 */
export class EventProgressTracker implements Pick<IEventTracker, 'waitFor' | 'markAsFailed'> {

	/** Default wait timeout, in milliseconds */
	static DEFAULT_TIMEOUT = 30_000;

	/** Default number of completed event IDs retained, when no projected event IDs provider is set */
	static DEFAULT_HISTORY_SIZE = 10_000;

	/** Default initial interval of shared storage polling, in milliseconds */
	static DEFAULT_POLL_INTERVAL = 50;

	/** Default maximum interval of shared storage polling, in milliseconds */
	static DEFAULT_MAX_POLL_INTERVAL = 1_000;

	readonly #completed = new Set<string>();
	readonly #waiters = new Map<string, {
		eventId: Identifier;
		waiters: Set<Waiter>;
	}>();
	readonly #historySize: number;
	readonly #timeout: number;
	readonly #projectedEventIdsProvider: ProjectedEventIdsProvider | undefined;
	readonly #pollInterval: number;
	readonly #maxPollInterval: number;
	#currentPollInterval: number;
	#pollTimer: ReturnType<typeof setTimeout> | undefined;
	#polling = false;

	/**
	 * @param options - Tracker options, or a provider of IDs of events projected in a shared storage
	 */
	constructor(options?: EventProgressTrackerOptions | ProjectedEventIdsProvider) {
		const o: EventProgressTrackerOptions | undefined = typeof options === 'function' ?
			{ projectedEventIdsProvider: options } :
			options;

		if (o?.timeout !== undefined)
			assertNonNegativeInteger(o.timeout, 'timeout');
		if (o?.historySize !== undefined)
			assertNonNegativeInteger(o.historySize, 'historySize');
		if (o?.projectedEventIdsProvider !== undefined)
			assertFunction(o.projectedEventIdsProvider, 'projectedEventIdsProvider');
		if (o?.pollInterval !== undefined)
			assertPositiveInteger(o.pollInterval, 'pollInterval');
		if (o?.maxPollInterval !== undefined)
			assertPositiveInteger(o.maxPollInterval, 'maxPollInterval');

		this.#timeout = o?.timeout ?? EventProgressTracker.DEFAULT_TIMEOUT;
		this.#projectedEventIdsProvider = o?.projectedEventIdsProvider;
		this.#historySize = o?.historySize
			?? (o?.projectedEventIdsProvider ? 0 : EventProgressTracker.DEFAULT_HISTORY_SIZE);
		this.#pollInterval = o?.pollInterval ?? EventProgressTracker.DEFAULT_POLL_INTERVAL;
		this.#maxPollInterval = Math.max(
			o?.maxPollInterval ?? EventProgressTracker.DEFAULT_MAX_POLL_INTERVAL,
			this.#pollInterval
		);
		this.#currentPollInterval = this.#pollInterval;
	}

	/**
	 * Resolves waits for the event. Events without an ID are ignored, since they cannot be awaited
	 */
	markAsCompleted(event: IEvent) {
		assertEvent(event, 'event');

		if (isIdentifier(event.id))
			this.#complete(String(event.id));
	}

	/**
	 * Rejects waits for the event. Events without an ID are ignored, since they cannot be awaited
	 */
	markAsFailed(event: IEvent, error: unknown) {
		assertEvent(event, 'event');

		if (!isIdentifier(event.id))
			return;

		const entry = this.#waiters.get(String(event.id));
		if (!entry)
			return;

		for (const waiter of entry.waiters)
			waiter.deferred.reject(error);
	}

	async waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void> {
		const timeout = options?.timeout ?? this.#timeout;
		const signal = options?.signal;
		assertNonNegativeInteger(timeout, 'options.timeout');

		const pending = this.#getPendingEventIds(eventIds);

		signal?.throwIfAborted();

		if (!pending.size)
			return;

		const waiter = this.#addWaiter(pending);
		const stopWatchingDeadline = watchDeadline(timeout, signal, reason => waiter.deferred.reject(reason));

		try {
			if (this.#projectedEventIdsProvider) {
				// the waiter is registered before the check, so completions in between are not missed
				this.#lookUpProjectedEvents([...pending.values()]);
				this.#currentPollInterval = this.#pollInterval;
				this.#schedulePoll();
			}

			await waiter.deferred.promise;
		}
		finally {
			stopWatchingDeadline();
			this.#removeWaiter(waiter, pending.keys());
		}
	}

	/** Get awaited event IDs by their keys, excluding events known to be completed */
	#getPendingEventIds(eventIds: Identifier | Identifier[]): Map<string, Identifier> {
		const pending = new Map<string, Identifier>();
		for (const eventId of Array.isArray(eventIds) ? eventIds : [eventIds]) {
			assertIdentifier(eventId, 'eventId');

			const key = String(eventId);
			if (!this.#completed.has(key))
				pending.set(key, eventId);
		}

		return pending;
	}

	#addWaiter(pending: Map<string, Identifier>): Waiter {
		const waiter: Waiter = {
			pending: new Set(pending.keys()),
			deferred: new Deferred()
		};

		for (const [key, eventId] of pending) {
			let entry = this.#waiters.get(key);
			if (!entry) {
				entry = { eventId, waiters: new Set() };
				this.#waiters.set(key, entry);
			}
			entry.waiters.add(waiter);
		}

		return waiter;
	}

	#removeWaiter(waiter: Waiter, keys: Iterable<string>) {
		for (const key of keys) {
			const entry = this.#waiters.get(key);
			entry?.waiters.delete(waiter);
			if (entry && !entry.waiters.size)
				this.#waiters.delete(key);
		}

		if (!this.#waiters.size) {
			clearTimeout(this.#pollTimer);
			this.#pollTimer = undefined;
		}
	}

	#complete(key: string) {
		if (this.#historySize) {
			this.#completed.delete(key);
			this.#completed.add(key);
			if (this.#completed.size > this.#historySize)
				this.#completed.delete(this.#completed.values().next().value!);
		}

		const entry = this.#waiters.get(key);
		if (!entry)
			return;

		this.#waiters.delete(key);
		for (const waiter of entry.waiters) {
			waiter.pending.delete(key);
			if (!waiter.pending.size)
				waiter.deferred.resolve();
		}
	}

	async #lookUpProjectedEvents(eventIds: Identifier[]) {
		try {
			const projectedEventIds = await this.#projectedEventIdsProvider!(eventIds);
			for (const eventId of projectedEventIds)
				this.#complete(String(eventId));
		}
		catch {
			// lookup errors are not propagated to waiters, the lookup is retried on the next poll
		}
	}

	#schedulePoll() {
		if (this.#pollTimer || this.#polling || !this.#waiters.size)
			return;

		this.#pollTimer = setTimeout(() => this.#poll(), this.#currentPollInterval);
	}

	/**
	 * Looks up all pending events and schedules the next poll.
	 * The poll timer is cleared once there are no waiters, so there is always something to look up.
	 */
	async #poll() {
		this.#pollTimer = undefined;
		this.#polling = true;
		try {
			await this.#lookUpProjectedEvents(Array.from(this.#waiters.values(), entry => entry.eventId));
		}
		finally {
			this.#polling = false;
		}

		this.#currentPollInterval = Math.min(this.#currentPollInterval * 2, this.#maxPollInterval);
		this.#schedulePoll();
	}
}
