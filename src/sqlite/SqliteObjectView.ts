import { AbstractSqliteView } from './AbstractSqliteView.ts';
import type { IObjectStorage, IEventLocker, Identifier } from '../interfaces/index.ts';
import { SqliteObjectStorage } from './SqliteObjectStorage.ts';
import type { Database } from 'better-sqlite3';
import { assertString } from '../utils/assert.ts';

/**
 * SQLite-backed object view with restore locking and last-processed-event tracking
 */
export class SqliteObjectView<TRecord> extends AbstractSqliteView implements IObjectStorage<TRecord>, IEventLocker {

	#sqliteObjectStorage: SqliteObjectStorage<TRecord>;

	constructor(options: ConstructorParameters<typeof AbstractSqliteView>[0] & {
		tableNamePrefix: string
	}) {
		assertString(options?.tableNamePrefix, 'options.tableNamePrefix');
		assertString(options?.schemaVersion, 'options.schemaVersion');

		super(options);

		this.#sqliteObjectStorage = new SqliteObjectStorage<TRecord>({
			viewModelSqliteDb: options.viewModelSqliteDb,
			viewModelSqliteDbFactory: options.viewModelSqliteDbFactory,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`
		});
	}

	// eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
	protected initialize(db: Database): Promise<void> | void {
		// No need to initialize the table here, it's done in SqliteObjectStorage
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		if (!this.ready)
			await this.once('ready');

		return this.#sqliteObjectStorage.get(id);
	}

	getSync(id: Identifier) {
		return this.#sqliteObjectStorage.getSync(id);
	}

	async create(id: Identifier, data: TRecord) {
		await this.#sqliteObjectStorage.create(id, data);
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord) {
		await this.#sqliteObjectStorage.update(id, update);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord) {
		await this.#sqliteObjectStorage.updateEnforcingNew(id, update);
	}

	async delete(id: Identifier): Promise<boolean> {
		return this.#sqliteObjectStorage.delete(id);
	}
}
