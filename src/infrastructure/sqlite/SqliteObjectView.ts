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

	get(id: string): TRecord | undefined {
		return this.#sqliteObjectStorage.get(id);
	}

	create(id: string, data: TRecord) {
		this.#sqliteObjectStorage.create(id, data);
	}

	update(id: string, update: (r: TRecord) => TRecord) {
		this.#sqliteObjectStorage.update(id, update);
	}

	updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		this.#sqliteObjectStorage.updateEnforcingNew(id, update);
	}

	delete(id: string): boolean {
		return this.#sqliteObjectStorage.delete(id);
	}
}
