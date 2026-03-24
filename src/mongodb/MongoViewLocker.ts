import type { Collection, Db } from 'mongodb';
import type { IContainer } from 'node-cqrs';
import type { ILogger, IViewLocker } from '../interfaces/index.ts';
import { assertString, Deferred } from '../utils/index.ts';
import { promisify } from 'util';
import { randomUUID } from 'node:crypto';
import { AbstractMongoAccessor } from './AbstractMongoAccessor.ts';
import type { MongoProjectionDataParams } from './MongoProjectionDataParams.ts';

const delay = promisify(setTimeout);

type ViewLockDocument = {
	_id: string;
	lockedTill: Date | null;
	token: string | null;
	lastEvent: string | null;
};

export type MongoViewLockerParams = MongoProjectionDataParams & {

	/**
	 * (Optional) Time-to-live (TTL) duration (in milliseconds) for which a view remains locked.
	 * The lock is automatically prolonged while still held by this instance.
	 *
	 * @default MongoViewLocker.DEFAULT_VIEW_LOCK_TTL
	 */
	viewLockTtl?: number;

	/**
	 * (Optional) MongoDB collection name used to store view locks.
	 *
	 * @default MongoViewLocker.DEFAULT_COLLECTION
	 */
	viewLocksCollection?: string;
};

/**
 * MongoDB-backed implementation of IViewLocker.
 *
 * Uses a MongoDB document with token + lockedTill semantics to acquire a distributed view lock.
 * The lock is automatically prolonged at half the TTL interval to prevent expiration
 * while processing is in progress.
 *
 * Collection name: `ncqrs_view_locks`
 */
export class MongoViewLocker extends AbstractMongoAccessor implements IViewLocker {

	static DEFAULT_VIEW_LOCK_TTL = 120_000;
	static DEFAULT_COLLECTION = 'ncqrs_view_locks';

	readonly #projectionName: string;
	readonly #lockId: string;
	readonly #viewLockTtl: number;
	readonly #collectionName: string;
	readonly #logger: ILogger | undefined;
	#lockToken: string | undefined;
	#lockMarker: Deferred<void> | undefined;
	#lockProlongationTimeout: NodeJS.Timeout | undefined;
	#collection: Collection<ViewLockDocument> | undefined;

	constructor(o: Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory' | 'logger'>>
		& MongoViewLockerParams) {
		super(o);

		assertString(o.projectionName, 'projectionName');
		assertString(o.schemaVersion, 'schemaVersion');
		if (o.viewLocksCollection !== undefined)
			assertString(o.viewLocksCollection, 'viewLocksCollection');

		this.#projectionName = o.projectionName;

		this.#collectionName = o.viewLocksCollection ?? MongoViewLocker.DEFAULT_COLLECTION;
		this.#lockId = `${o.projectionName}:${o.schemaVersion}`;
		this.#viewLockTtl = o.viewLockTtl ?? MongoViewLocker.DEFAULT_VIEW_LOCK_TTL;
		this.#logger = o.logger && 'child' in o.logger ?
			o.logger.child({ service: this.constructor.name }) :
			o.logger;
	}

	protected async initialize(db: Db): Promise<void> {
		this.#collection = db.collection<ViewLockDocument>(this.#collectionName);
		await this.#collection.createIndex({ lockedTill: 1 }, { sparse: true });
	}

	get ready(): boolean {
		return !this.#lockMarker;
	}

	async lock(): Promise<boolean> {
		this.#lockMarker = new Deferred();
		this.#lockToken = randomUUID();

		await this.assertConnection();

		let lockAcquired = false;
		while (!lockAcquired) {
			const now = new Date();
			const lockedTill = new Date(now.getTime() + this.#viewLockTtl);

			// Claim an expired or released lock if one exists
			const updateResult = await this.#collection!.updateOne(
				{
					_id: this.#lockId,
					$or: [
						{ lockedTill: null },
						{ lockedTill: { $exists: false } },
						{ lockedTill: { $lt: now } }
					]
				},
				{ $set: { lockedTill, token: this.#lockToken } }
			);

			if (updateResult.modifiedCount === 1) {
				lockAcquired = true;
			}
			else {
				// No existing document matched — try to insert a fresh lock
				try {
					await this.#collection!.insertOne({
						_id: this.#lockId,
						lockedTill,
						token: this.#lockToken,
						lastEvent: null
					});
					lockAcquired = true;
				}
				catch (err: unknown) {
					if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
						// Document exists and is actively locked — wait and retry
						this.#logger?.debug(`"${this.#projectionName}" is locked by another process`);
						await delay(this.#viewLockTtl / 2);
					}
					else {
						throw err;
					}
				}
			}
		}

		this.#logger?.debug(`"${this.#projectionName}" lock obtained for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();

		return true;
	}

	private scheduleLockProlongation() {
		const ms = this.#viewLockTtl / 2;

		this.#lockProlongationTimeout = setTimeout(() => this.prolongLock(), ms);
		this.#lockProlongationTimeout.unref();

		this.#logger?.debug(`"${this.#projectionName}" lock refresh scheduled in ${ms}ms`);
	}

	private cancelLockProlongation() {
		clearTimeout(this.#lockProlongationTimeout);
		this.#logger?.debug(`"${this.#projectionName}" lock refresh canceled`);
	}

	private async prolongLock() {
		await this.assertConnection();

		const lockedTill = new Date(Date.now() + this.#viewLockTtl);

		const result = await this.#collection!.findOneAndUpdate(
			{ _id: this.#lockId, token: this.#lockToken },
			{ $set: { lockedTill } }
		);

		if (!result)
			throw new Error(`"${this.#projectionName}" lock could not be prolonged`);

		this.#logger?.debug(`"${this.#projectionName}" lock prolonged for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();
	}

	async unlock(): Promise<void> {
		this.#lockMarker?.resolve();
		this.#lockMarker = undefined;

		this.cancelLockProlongation();

		await this.assertConnection();

		const result = await this.#collection!.findOneAndUpdate(
			{ _id: this.#lockId, token: this.#lockToken },
			{ $set: { lockedTill: null, token: null } }
		);

		this.#lockToken = undefined;

		if (result)
			this.#logger?.debug(`"${this.#projectionName}" lock released`);
		else
			this.#logger?.warn(`"${this.#projectionName}" lock didn't exist`);
	}

	once(event: 'ready'): Promise<void> {
		if (event !== 'ready')
			throw new TypeError(`Unexpected event: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
