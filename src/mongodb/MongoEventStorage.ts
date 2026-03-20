import { ObjectId, type Collection, type Db, type Document, type Filter } from 'mongodb';
import type {
	IIdentifierProvider,
	IEvent,
	IEventSet,
	EventQueryAfter,
	IEventStorageReader,
	IEventStream,
	Identifier,
	IDispatchPipelineProcessor,
	DispatchPipelineBatch,
	AggregateEventsQueryParams
} from '../interfaces/index.ts';
import { parseSagaId } from '../utils/index.ts';
import { ConcurrencyError } from '../errors/index.ts';
import { registerExitCleanup } from './registerExitCleanup.ts';

type EventDocument = Document & {
	_id: ObjectId;
	type: string;
	aggregateId?: ObjectId | string;
	aggregateVersion?: number;
	sagaOrigins?: Record<string, string>;
	payload?: unknown;
	context?: unknown;
};

function toObjectId(id: Identifier): ObjectId {
	return new ObjectId(String(id));
}

function isHexObjectId(value: unknown): value is string {
	return typeof value === 'string' && value.length === 24 && /^[0-9a-f]{24}$/i.test(value);
}

function toObjectIdOrString(aggregateId: Identifier): ObjectId | string {
	if (isHexObjectId(aggregateId))
		return toObjectId(aggregateId);

	return String(aggregateId);
}

function toEvent(doc: EventDocument): IEvent {
	const { _id, aggregateId, ...rest } = doc;
	return {
		...rest,
		id: _id.toHexString(),
		...aggregateId && {
			aggregateId: aggregateId instanceof ObjectId ? aggregateId.toHexString() : aggregateId
		}
	};
}

function toEventDocument(event: IEvent): EventDocument {
	const { id, aggregateId, ...rest } = event;
	return {
		...rest,
		_id: id !== undefined ? toObjectId(id) : new ObjectId(),
		...aggregateId && {
			aggregateId: toObjectIdOrString(aggregateId)
		}
	};
}

/**
 * MongoDB-backed event storage for node-cqrs.
 * Implements IEventStorageReader, IIdentifierProvider, and IDispatchPipelineProcessor.
 */
export class MongoEventStorage implements
	IEventStorageReader,
	IIdentifierProvider,
	IDispatchPipelineProcessor {

	static readonly EVENTS_COLLECTION = 'events';

	readonly #initPromise: Promise<{
		db: Db;
		collection: Collection<EventDocument>
	}>;

	constructor({
		mongoDbFactory,
		mongoEventStorageConfig,
		process
	}: {
		mongoDbFactory: () => Promise<Db> | Db;
		mongoEventStorageConfig?: { collection?: string };
		process?: NodeJS.Process;
	}) {
		if (typeof mongoDbFactory !== 'function')
			throw new TypeError('mongoDbFactory must be a Function');

		const collectionName = mongoEventStorageConfig?.collection ?? MongoEventStorage.EVENTS_COLLECTION;

		this.#initPromise = MongoEventStorage.#init(mongoDbFactory, collectionName);

		if (process) {
			registerExitCleanup(process, async () => {
				const { db } = await this.#initPromise;
				await db.client.close();
			});
		}
	}

	static async #init(factory: () => Promise<Db> | Db, collectionName: string): Promise<{
		db: Db;
		collection: Collection<EventDocument>
	}> {
		const db = await factory();
		const collection = db.collection<EventDocument>(collectionName);

		await Promise.all([
			collection.createIndex({ aggregateId: 1, aggregateVersion: 1 }, { unique: true, sparse: true }),
			collection.createIndex({ 'sagaOrigins.$**': 1 }),
			collection.createIndex({ type: 1, _id: 1 })
		]);

		return { db, collection };
	}

	// eslint-disable-next-line class-methods-use-this
	getNewId(): string {
		return new ObjectId().toHexString();
	}

	async commitEvents(events: IEventSet, options?: { ignoreConcurrencyError?: boolean }): Promise<IEventSet> {
		if (options?.ignoreConcurrencyError)
			throw new Error('ignoreConcurrencyError is not supported by MongoEventStorage');

		const { collection } = await this.#initPromise;

		const docs = events.map(toEventDocument);

		// ordered: true is safe because all events in a batch share the same aggregateId
		// with sequential versions - if any version conflicts, it will be the first one,
		// so no events are partially committed
		try {
			await collection.insertMany(docs, { ordered: true });
		}
		catch (err: unknown) {
			if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000)
				throw new ConcurrencyError('Concurrency conflict: duplicate event version');
			throw err;
		}

		docs.forEach((doc, i) => {
			(events as IEvent[])[i].id = doc._id.toHexString();
		});

		return events as IEvent[];
	}

	async* getAggregateEvents(aggregateId: Identifier, options?: AggregateEventsQueryParams): IEventStream {
		const { collection } = await this.#initPromise;

		const filter: Filter<EventDocument> = {
			aggregateId: toObjectIdOrString(aggregateId)
		};

		const snapshotVersion = options?.snapshot?.aggregateVersion;
		if (snapshotVersion !== undefined)
			filter.aggregateVersion = { $gt: snapshotVersion };

		const hasTypeFilter = options?.eventTypes !== undefined && options.eventTypes.length > 0;

		if (hasTypeFilter)
			filter.type = { $in: options!.eventTypes as string[] };

		const cursor = collection.find(filter, {
			sort: { aggregateVersion: 1 }
		});

		let lastDoc: EventDocument | undefined;
		for await (const doc of cursor) {
			lastDoc = doc;
			yield toEvent(doc);
		}

		if (options?.tail === 'last' && hasTypeFilter) {
			const tailFilter: Filter<EventDocument> = {
				aggregateId: toObjectIdOrString(aggregateId),
				...snapshotVersion && {
					aggregateVersion: { $gt: snapshotVersion }
				}
			};

			const tailDoc = await collection.findOne(tailFilter, {
				sort: { aggregateVersion: -1 }
			});

			if (tailDoc && (!lastDoc || tailDoc._id.toHexString() !== lastDoc._id.toHexString()))
				yield toEvent(tailDoc);
		}
	}

	async* getSagaEvents(sagaId: Identifier, { beforeEvent }: { beforeEvent: IEvent }): IEventStream {
		if (typeof beforeEvent?.id !== 'string' || !beforeEvent.id.length)
			throw new TypeError('beforeEvent.id must be a non-empty String');

		const { sagaDescriptor, originEventId } = parseSagaId(sagaId);

		if (beforeEvent.sagaOrigins?.[sagaDescriptor] !== originEventId)
			throw new TypeError('beforeEvent.sagaOrigins does not match sagaId');

		const { collection } = await this.#initPromise;

		const originObjectId = toObjectId(originEventId);
		const beforeObjectId = toObjectId(beforeEvent.id);

		const filter: Filter<EventDocument> = {
			$or: [
				{ _id: originObjectId },
				{
					[`sagaOrigins.${sagaDescriptor}`]: originEventId,
					_id: {
						$gt: originObjectId,
						$lt: beforeObjectId
					}
				}
			]
		};

		const cursor = collection.find(filter, {
			sort: { _id: 1 }
		});

		for await (const doc of cursor)
			yield toEvent(doc);
	}

	async* getEventsByTypes(eventTypes: Readonly<string[]>, options?: EventQueryAfter): IEventStream {
		if (options?.afterEvent !== undefined && (typeof options.afterEvent.id !== 'string' || !options.afterEvent.id.length))
			throw new TypeError('options.afterEvent.id must be a non-empty String');

		const { collection } = await this.#initPromise;

		const filter: Filter<EventDocument> = {
			type: { $in: eventTypes }
		};

		if (options?.afterEvent?.id)
			filter._id = { $gt: toObjectId(options.afterEvent.id) };

		const cursor = collection.find(filter, {
			sort: { _id: 1 }
		});

		for await (const doc of cursor)
			yield toEvent(doc);
	}

	/**
	 * Processes a batch of dispatch pipeline items, commits the events to MongoDB,
	 * and returns the original batch.
	 *
	 * This method is part of the `IDispatchPipelineProcessor` interface.
	 */
	async process(batch: DispatchPipelineBatch): Promise<DispatchPipelineBatch> {
		const events: IEvent[] = [];
		for (const { event } of batch) {
			if (!event)
				throw new Error('Event batch does not contain `event`');

			events.push(event);
		}

		await this.commitEvents(events);

		return batch;
	}
}
