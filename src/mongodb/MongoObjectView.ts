import { AbstractMongoView } from './AbstractMongoView.ts';
import type { IObjectStorage, IEventLocker, Identifier } from '../interfaces/index.ts';
import { MongoObjectStorage } from './MongoObjectStorage.ts';
import { assertString } from '../utils/assert.ts';

/**
 * MongoDB-backed object view with restore locking and last-processed-event tracking
 */
export class MongoObjectView<TRecord> extends AbstractMongoView implements IObjectStorage<TRecord>, IEventLocker {

	readonly #mongoObjectStorage: MongoObjectStorage<TRecord>;

	constructor(options: ConstructorParameters<typeof AbstractMongoView>[0] & {
		tableNamePrefix: string
	}) {
		assertString(options?.tableNamePrefix, 'tableNamePrefix');
		assertString(options?.schemaVersion, 'schemaVersion');

		super(options);

		this.#mongoObjectStorage = new MongoObjectStorage<TRecord>({
			viewModelMongoDb: options.viewModelMongoDb,
			viewModelMongoDbFactory: options.viewModelMongoDbFactory,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`
		});
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		if (!this.ready)
			await this.once('ready');

		return this.#mongoObjectStorage.get(id);
	}

	async create(id: Identifier, data: TRecord) {
		await this.#mongoObjectStorage.create(id, data);
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord) {
		await this.#mongoObjectStorage.update(id, update);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord) {
		await this.#mongoObjectStorage.updateEnforcingNew(id, update);
	}

	async delete(id: Identifier): Promise<boolean> {
		return this.#mongoObjectStorage.delete(id);
	}
}
