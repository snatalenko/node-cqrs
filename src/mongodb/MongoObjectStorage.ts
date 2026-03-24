import type { Collection, Db } from 'mongodb';
import type { IContainer } from 'node-cqrs';
import type { IObjectStorage, Identifier } from '../interfaces/index.ts';
import { assertDefined, assertFunction, assertNonNegativeInteger, assertString } from '../utils/assert.ts';
import { AbstractMongoAccessor } from './AbstractMongoAccessor.ts';

type RecordDocument<TRecord> = {
	_id: string;
	data: TRecord;
	version: number;
};

/**
 * MongoDB-backed implementation of IObjectStorage.
 *
 * Each record is stored as a document `{ _id, data, version }`.
 * The version field enables optimistic concurrency control: `update` and
 * `updateEnforcingNew` re-read the record after the user callback runs and
 * atomically commit only when the version still matches.
 * On mismatch the operation retries up to `maxRetries` times.
 */
export class MongoObjectStorage<TRecord> extends AbstractMongoAccessor implements IObjectStorage<TRecord> {

	readonly #tableName: string;
	readonly #maxRetries: number;
	#collection: Collection<RecordDocument<TRecord>> | undefined;

	constructor(o: Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory'>> & {
		tableName: string;
		maxRetries?: number;
	}) {
		super(o);

		assertString(o.tableName, 'tableName');
		if (o.maxRetries !== undefined)
			assertNonNegativeInteger(o.maxRetries, 'maxRetries');

		this.#tableName = o.tableName;
		this.#maxRetries = o.maxRetries ?? 100;
	}

	protected async initialize(db: Db): Promise<void> {
		this.#collection = db.collection<RecordDocument<TRecord>>(this.#tableName);
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const doc = await this.#collection!.findOne({ _id: String(id) } as any);
		if (!doc)
			return undefined;

		return doc.data;
	}

	async create(id: Identifier, data: TRecord): Promise<void> {
		assertDefined(id, 'id');
		await this.assertConnection();

		try {
			await this.#collection!.insertOne({ _id: String(id), data, version: 1 } as any);
		}
		catch (err: unknown) {
			if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000)
				throw new Error(`Record '${id}' could not be created`);
			throw err;
		}
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const doc = await this.#collection!.findOne({ _id: String(id) });
			if (!doc)
				throw new Error(`Record '${id}' does not exist`);

			const updatedData = update(doc.data);

			const result = await this.#collection!.findOneAndUpdate(
				{ _id: String(id), version: doc.version },
				{ $set: { data: updatedData, version: doc.version + 1 } }
			);

			if (result)
				return;

			// version mismatch — retry
		}

		throw new Error(`Record '${id}' could not be updated after ${this.#maxRetries} retries`);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const doc = await this.#collection!.findOne({ _id: String(id) });

			if (doc) {
				const updatedData = update(doc.data);

				const result = await this.#collection!.findOneAndUpdate(
					{ _id: String(id), version: doc.version },
					{ $set: { data: updatedData, version: doc.version + 1 } }
				);

				if (result)
					return;

				// version mismatch — retry
			}
			else {
				try {
					await this.#collection!.insertOne({ _id: String(id), data: update(undefined), version: 1 });
					return;
				}
				catch (err: unknown) {
					if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000)
						continue; // Another process inserted first — retry

					throw err;
				}
			}
		}

		throw new Error(`Record '${id}' could not be upserted after ${this.#maxRetries} retries`);
	}

	async delete(id: Identifier): Promise<boolean> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const result = await this.#collection!.deleteOne({ _id: String(id) });
		return result.deletedCount === 1;
	}
}
