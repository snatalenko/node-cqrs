import { AbstractSqliteView } from './AbstractSqliteView';
import { IObjectStorage, IEventLocker } from '../interfaces';
import { SqliteObjectStorage } from './SqliteObjectStorage';

export class SqliteObjectView<TRecord> extends AbstractSqliteView implements IObjectStorage<TRecord>, IEventLocker {

	#sqliteObjectStorage: SqliteObjectStorage<TRecord>;

	constructor(options: ConstructorParameters<typeof AbstractSqliteView>[0] & {
		tableNamePrefix: string
	}) {
		if (typeof options.tableNamePrefix !== 'string' || !options.tableNamePrefix.length)
			throw new TypeError('tableNamePrefix argument must be a non-empty String');
		if (typeof options.schemaVersion !== 'string' || !options.schemaVersion.length)
			throw new TypeError('schemaVersion argument must be a non-empty String');

		super(options);

		this.#sqliteObjectStorage = new SqliteObjectStorage<TRecord>({
			viewModelSqliteDb: options.viewModelSqliteDb,
			viewModelSqliteDbFactory: options.viewModelSqliteDbFactory,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`
		});
	}

	async get(id: string): Promise<TRecord | undefined> {
		if (!this.ready)
			await this.once('ready');

		return this.#sqliteObjectStorage.get(id);
	}

	getSync(id: string) {
		return this.#sqliteObjectStorage.getSync(id);
	}

	async create(id: string, data: TRecord) {
		await this.#sqliteObjectStorage.create(id, data);
	}

	async update(id: string, update: (r: TRecord) => TRecord) {
		await this.#sqliteObjectStorage.update(id, update);
	}

	async updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		await this.#sqliteObjectStorage.updateEnforcingNew(id, update);
	}

	async delete(id: string): Promise<boolean> {
		return this.#sqliteObjectStorage.delete(id);
	}
}
