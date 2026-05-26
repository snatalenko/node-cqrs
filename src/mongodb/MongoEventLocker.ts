import type { Collection, Db } from 'mongodb';
import type { IContainer } from 'node-cqrs';
import type { IEvent, IEventLocker } from '../interfaces/index.ts';
import { assertNonNegativeInteger, assertString } from '../utils/assert.ts';
import { AbstractMongoAccessor } from './AbstractMongoAccessor.ts';
import type { MongoProjectionDataParams } from './MongoProjectionDataParams.ts';
import { getEventId } from './utils/index.ts';

type EventLockDocument = {
	_id: string;
	processingAt: Date | null;
	processedAt: Date | null;
};

type ViewLockDocument = {
	_id: string;
	lastEvent: string | null;
};

export type MongoEventLockerParams = MongoProjectionDataParams & {

	/**
	 * (Optional) Time-to-live (TTL) duration in milliseconds
	 * for which an event remains in the "processing" state until released.
	 *
	 * @default MongoEventLocker.DEFAULT_EVENT_LOCK_TTL
	 */
	eventLockTtl?: number;

	/**
	 * (Optional) MongoDB collection name used to store per-event processing locks.
	 *
	 * @default MongoEventLocker.DEFAULT_EVENT_LOCKS_COLLECTION
	 */
	eventLocksCollection?: string;

	/**
	 * (Optional) MongoDB collection name used to store the last processed event per projection.
	 *
	 * @default MongoEventLocker.DEFAULT_VIEW_LOCKS_COLLECTION
	 */
	viewLocksCollection?: string;
};

/**
 * MongoDB-backed implementation of IEventLocker.
 *
 * Uses two collections:
 * - `ncqrs_event_locks`: tracks per-event processing state
 * - `ncqrs_view_locks`: stores the last processed event per projection
 *
 * Event lock state machine: nil → processing → processed
 */
export class MongoEventLocker extends AbstractMongoAccessor implements IEventLocker {

	static DEFAULT_EVENT_LOCK_TTL = 15_000;
	static DEFAULT_EVENT_LOCKS_COLLECTION = 'ncqrs_event_locks';
	static DEFAULT_VIEW_LOCKS_COLLECTION = 'ncqrs_view_locks';

	readonly #lockIdPrefix: string;
	readonly #viewLockId: string;
	readonly #eventLockTtl: number;
	readonly #eventLocksCollectionName: string;
	readonly #viewLocksCollectionName: string;
	#eventLocksCollection: Collection<EventLockDocument> | undefined;
	#viewLocksCollection: Collection<ViewLockDocument> | undefined;

	constructor(o: Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory'>>
		& MongoEventLockerParams) {
		super(o);

		assertString(o.projectionName, 'projectionName');
		assertString(o.schemaVersion, 'schemaVersion');
		if (o.eventLockTtl !== undefined)
			assertNonNegativeInteger(o.eventLockTtl, 'eventLockTtl');
		if (o.eventLocksCollection !== undefined)
			assertString(o.eventLocksCollection, 'eventLocksCollection');
		if (o.viewLocksCollection !== undefined)
			assertString(o.viewLocksCollection, 'viewLocksCollection');

		this.#eventLocksCollectionName = o.eventLocksCollection ?? MongoEventLocker.DEFAULT_EVENT_LOCKS_COLLECTION;
		this.#viewLocksCollectionName = o.viewLocksCollection ?? MongoEventLocker.DEFAULT_VIEW_LOCKS_COLLECTION;
		this.#lockIdPrefix = `${o.projectionName}:${o.schemaVersion}`;
		this.#viewLockId = `${o.projectionName}:${o.schemaVersion}`;
		this.#eventLockTtl = o.eventLockTtl ?? MongoEventLocker.DEFAULT_EVENT_LOCK_TTL;
	}

	protected async initialize(db: Db): Promise<void> {
		this.#eventLocksCollection = db.collection<EventLockDocument>(this.#eventLocksCollectionName);
		this.#viewLocksCollection = db.collection<ViewLockDocument>(this.#viewLocksCollectionName);

		await this.#eventLocksCollection.createIndex({ processingAt: 1 }, { sparse: true });
	}

	#eventLockId(eventId: string): string {
		return `${this.#lockIdPrefix}:${eventId}`;
	}

	async tryMarkAsProjecting(event: IEvent): Promise<boolean> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const lockId = this.#eventLockId(eventId);
		const now = new Date();
		const lockExpiry = new Date(now.getTime() - this.#eventLockTtl);

		// Claim an expired lock if one exists
		const updateResult = await this.#eventLocksCollection!.updateOne(
			{
				_id: lockId,
				processedAt: null,
				$or: [
					{ processingAt: null },
					{ processingAt: { $exists: false } },
					{ processingAt: { $lt: lockExpiry } }
				]
			},
			{ $set: { processingAt: now, processedAt: null } }
		);

		if (updateResult.modifiedCount === 1)
			return true;

		// No existing document matched — try to insert a fresh lock
		try {
			await this.#eventLocksCollection!.insertOne({ _id: lockId, processingAt: now, processedAt: null });
			return true;
		}
		catch (err: unknown) {
			if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000)
				return false; // Document exists and is actively locked

			throw err;
		}
	}

	async markAsProjected(event: IEvent): Promise<void> {
		await this.assertConnection();

		const eventId = getEventId(event);
		const lockId = this.#eventLockId(eventId);

		const result = await this.#eventLocksCollection!.findOneAndUpdate(
			{ _id: lockId, processedAt: null },
			{ $set: { processedAt: new Date() } }
		);

		if (!result)
			throw new Error(`Event ${event.id} could not be marked as processed`);
	}

	async markAsLastEvent(event: IEvent): Promise<void> {
		await this.assertConnection();

		await this.#viewLocksCollection!.updateOne(
			{ _id: this.#viewLockId },
			{
				$set: { lastEvent: JSON.stringify(event) },
				$setOnInsert: { _id: this.#viewLockId }
			},
			{ upsert: true }
		);
	}

	async getLastEvent(): Promise<IEvent | undefined> {
		await this.assertConnection();

		const doc = await this.#viewLocksCollection!.findOne({ _id: this.#viewLockId });
		if (!doc?.lastEvent)
			return undefined;

		return JSON.parse(doc.lastEvent);
	}
}
