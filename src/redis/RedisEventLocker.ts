import type { Redis } from 'ioredis';
import type { IContainer } from 'node-cqrs';
import type { EventTrackerWaitOptions, Identifier, IEvent, IEventTracker } from '../interfaces/index.ts';
import { assertString } from '../utils/assert.ts';
import { EventProgressTracker } from '../utils/EventProgressTracker.ts';
import { serializeEvent } from '../utils/serializeEvent.ts';
import { AbstractRedisAccessor } from './AbstractRedisAccessor.ts';
import type { RedisProjectionDataParams } from './RedisProjectionDataParams.ts';
import { getEventId } from './utils/index.ts';

/**
 * Atomically acquires the event processing lock.
 *
 * KEYS[1] = event lock key
 * ARGV[1] = TTL in milliseconds for the "processing" marker
 *
 * Returns:
 *   1  = lock acquired (event is new or its "processing" marker expired)
 *   0  = lock not acquired (already "processing" or "processed")
 */
const SCRIPT_TRY_LOCK = `
local val = redis.call("GET", KEYS[1])
if val then return 0 end
redis.call("SET", KEYS[1], "processing", "PX", ARGV[1])
return 1
`;

/**
 * Finalises the event lock, transitioning it from "processing" to "processed".
 *
 * KEYS[1] = event lock key
 *
 * Returns:
 *   1  = success
 *   0  = key is missing or not in "processing" state (already processed or expired)
 */
const SCRIPT_FINALIZE_LOCK = `
local val = redis.call("GET", KEYS[1])
if val ~= "processing" then return 0 end
redis.call("SET", KEYS[1], "processed")
return 1
`;

export type RedisEventLockerParams = RedisProjectionDataParams & {

	/**
	 * (Optional) Time-to-live (TTL) duration in milliseconds for which an event
	 * remains in the "processing" state. After expiry Redis removes the key
	 * automatically, allowing another instance to re-acquire the lock.
	 *
	 * @default 15_000
	 */
	eventLockTtl?: number;
};

/**
 * Redis-backed implementation of IEventTracker.
 *
 * Uses Lua scripts for atomic state transitions:
 * - `tryMarkAsProjecting`: SET key "processing" NX PX {ttl}
 * - `markAsProjected`: transitions "processing" → "processed" (permanent)
 * - `markAsLastEvent` / `getLastEvent`: a single JSON key per projection
 *
 * Key formats:
 * - Event lock:  `{keyPrefix}:evtlock:{projectionName}:{schemaVersion}:{eventId}`
 * - Last event:  `{keyPrefix}:lastevent:{projectionName}:{schemaVersion}`
 */
export class RedisEventLocker extends AbstractRedisAccessor implements IEventTracker {

	#eventLockKeyPrefix: string;
	#lastEventKey: string;
	#eventLockTtl: number;
	readonly #progress = new EventProgressTracker(eventIds => this.#getProjectedEventIds(eventIds));

	constructor(o: Partial<Pick<IContainer, 'viewModelRedis' | 'viewModelRedisFactory'>>
		& RedisEventLockerParams) {
		super(o);

		assertString(o.projectionName, 'o.projectionName');
		assertString(o.schemaVersion, 'o.schemaVersion');

		const keyPrefix = o.keyPrefix ?? 'ncqrs';
		this.#eventLockKeyPrefix = `${keyPrefix}:evtlock:${o.projectionName}:${o.schemaVersion}`;
		this.#lastEventKey = `${keyPrefix}:lastevent:${o.projectionName}:${o.schemaVersion}`;
		this.#eventLockTtl = o.eventLockTtl ?? 15_000;
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_redis: Redis): void {
		// No Redis-level setup required for event locking
	}

	#eventLockKey(eventId: Identifier): string {
		return `${this.#eventLockKeyPrefix}:${eventId}`;
	}

	/** Get IDs of the given events, which are marked as projected by any process */
	async #getProjectedEventIds(eventIds: Identifier[]): Promise<Identifier[]> {
		await this.assertConnection();

		const lockKeys = eventIds.map(id => this.#eventLockKey(getEventId({ id } as IEvent)));
		const values = await this.redis!.mget(lockKeys);

		return eventIds.filter((_id, i) => values[i] === 'processed');
	}

	async tryMarkAsProjecting(event: IEvent): Promise<boolean> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const result = await this.redis!.eval(
			SCRIPT_TRY_LOCK,
			1,
			this.#eventLockKey(eventId),
			String(this.#eventLockTtl)
		) as number;

		return result === 1;
	}

	async markAsProjected(event: IEvent): Promise<void> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const result = await this.redis!.eval(
			SCRIPT_FINALIZE_LOCK,
			1,
			this.#eventLockKey(eventId)
		) as number;

		if (result !== 1)
			throw new Error(`Event ${event.id} could not be marked as processed`);

		this.#progress.markAsCompleted(event);
	}

	markAsFailed(event: IEvent, error: unknown) {
		this.#progress.markAsFailed(event, error);
	}

	waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void> {
		return this.#progress.waitFor(eventIds, options);
	}

	async markAsLastEvent(event: IEvent): Promise<void> {
		await this.assertConnection();

		await this.redis!.set(this.#lastEventKey, serializeEvent(event));
	}

	async getLastEvent(): Promise<IEvent | undefined> {
		await this.assertConnection();

		const raw = await this.redis!.get(this.#lastEventKey);
		if (!raw)
			return undefined;

		return JSON.parse(raw);
	}
}
