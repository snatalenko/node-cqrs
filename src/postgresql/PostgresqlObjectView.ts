import type { IEventLocker, Identifier, IObjectStorage } from '../interfaces/index.ts';
import { assertString } from '../utils/assert.ts';
import { AbstractPostgresqlView } from './AbstractPostgresqlView.ts';
import { PostgresqlObjectStorage } from './PostgresqlObjectStorage.ts';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';

/**
 * PostgreSQL-backed object view with restore locking and last-processed-event tracking.
 */
export class PostgresqlObjectView<TRecord>
	extends AbstractPostgresqlView
	implements IObjectStorage<TRecord>, IEventLocker {

	readonly #postgresqlObjectStorage: PostgresqlObjectStorage<TRecord>;

	constructor(options: ConstructorParameters<typeof AbstractPostgresqlView>[0] & {
		tableNamePrefix: string;
		postgresqlObjectStorageMaxRetries?: number;
	}) {
		assertString(options?.tableNamePrefix, 'tableNamePrefix');
		assertString(options?.schemaVersion, 'schemaVersion');

		super(options);

		this.#postgresqlObjectStorage = new PostgresqlObjectStorage<TRecord>({
			viewModelPostgresqlDb: options.viewModelPostgresqlDb,
			viewModelPostgresqlDbFactory: options.viewModelPostgresqlDbFactory,
			tableName: `${options.tableNamePrefix}_${options.schemaVersion}`,
			maxRetries: options.postgresqlObjectStorageMaxRetries
		});
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_db: PostgresqlConnection): Promise<void> | void {
		// No need to initialize the table here, it's done in PostgresqlObjectStorage
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		if (!this.ready)
			await this.once('ready');

		return this.#postgresqlObjectStorage.get(id);
	}

	async create(id: Identifier, data: TRecord) {
		await this.#postgresqlObjectStorage.create(id, data);
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord) {
		await this.#postgresqlObjectStorage.update(id, update);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord) {
		await this.#postgresqlObjectStorage.updateEnforcingNew(id, update);
	}

	async delete(id: Identifier): Promise<boolean> {
		return this.#postgresqlObjectStorage.delete(id);
	}
}
