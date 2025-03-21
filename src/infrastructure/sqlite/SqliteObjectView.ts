import { AbstractSqliteView } from "./AbstractSqliteView";
import { IObjectStorage, IEventLocker } from '../../interfaces';
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

		this.#sqliteObjectStorage = new SqliteObjectStorage({
			viewModelSqliteDb: options.viewModelSqliteDb,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`
		});
	}

	async get(id: string): Promise<TRecord | undefined> {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		if (!this.ready)
			await this.once('ready');

		return this.#sqliteObjectStorage.get(id);
	}

	getSync(id: string) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		return this.#sqliteObjectStorage.get(id);
	}

	create(id: string, data: TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		this.#sqliteObjectStorage.create(id, data);
	}

	update(id: string, update: (r: TRecord) => TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		this.#sqliteObjectStorage.update(id, update);
	}

	updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		this.#sqliteObjectStorage.updateEnforcingNew(id, update);
	}

	delete(id: string): boolean {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		return this.#sqliteObjectStorage.delete(id);
	}
}
