import type { IContainer } from 'node-cqrs';
import type { Identifier, IObjectStorage } from '../interfaces/index.ts';
import { assertDefined, assertFunction, assertNonNegativeInteger, assertString } from '../utils/assert.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';
import { quoteIdentifier } from './utils/index.ts';

type RecordRow<TRecord> = {
	data: TRecord | string;
	version: number;
};

/**
 * PostgreSQL-backed implementation of IObjectStorage.
 *
 * Each record is stored as a row `{ id, data, version }`.
 * The version field enables optimistic concurrency control: `update` and
 * `updateEnforcingNew` re-read the record after the user callback runs and
 * atomically commit only when the version still matches.
 * On mismatch the operation retries up to `maxRetries` times.
 */
export class PostgresqlObjectStorage<TRecord> extends AbstractPostgresqlAccessor implements IObjectStorage<TRecord> {

	readonly #tableName: string;
	readonly #maxRetries: number;

	constructor(o: Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory'>> & {
		tableName: string;
		maxRetries?: number;
	}) {
		super(o);

		assertString(o.tableName, 'tableName');
		if (o.maxRetries !== undefined)
			assertNonNegativeInteger(o.maxRetries, 'maxRetries');

		this.#tableName = quoteIdentifier(o.tableName);
		this.#maxRetries = o.maxRetries ?? 100;
	}

	protected async initialize(db: PostgresqlConnection): Promise<void> {
		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#tableName} (
				id text PRIMARY KEY,
				version integer NOT NULL DEFAULT 1,
				data jsonb NOT NULL
			)
		`);
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const result = await this.connection.query<RecordRow<TRecord>>(`
			SELECT data, version
			FROM ${this.#tableName}
			WHERE id = $1
		`, [String(id)]);

		const row = result.rows[0];
		if (!row)
			return undefined;

		return PostgresqlObjectStorage.parseData<TRecord>(row.data);
	}

	async create(id: Identifier, data: TRecord): Promise<void> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const result = await this.connection.query(`
			INSERT INTO ${this.#tableName} (id, data)
			VALUES ($1, $2::jsonb)
			ON CONFLICT (id) DO NOTHING
		`, [String(id), JSON.stringify(data)]);

		if (result.rowCount !== 1)
			throw new Error(`Record '${id}' could not be created`);
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const row = await this.getRow(id);
			if (!row)
				throw new Error(`Record '${id}' does not exist`);

			const updatedData = update(PostgresqlObjectStorage.parseData<TRecord>(row.data));
			const result = await this.updateByVersion(id, row.version, updatedData);
			if (result.rowCount === 1)
				return;

			// version mismatch - retry
		}

		throw new Error(`Record '${id}' could not be updated after ${this.#maxRetries} retries`);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const row = await this.getRow(id);

			if (row) {
				const updatedData = update(PostgresqlObjectStorage.parseData<TRecord>(row.data));
				const result = await this.updateByVersion(id, row.version, updatedData);
				if (result.rowCount === 1)
					return;

				// version mismatch - retry
			}
			else {
				const result = await this.connection.query(`
					INSERT INTO ${this.#tableName} (id, data)
					VALUES ($1, $2::jsonb)
					ON CONFLICT (id) DO NOTHING
				`, [String(id), JSON.stringify(update(undefined))]);

				if (result.rowCount === 1)
					return;

				// Another process inserted first - retry
			}
		}

		throw new Error(`Record '${id}' could not be upserted after ${this.#maxRetries} retries`);
	}

	async delete(id: Identifier): Promise<boolean> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const result = await this.connection.query(`
			DELETE FROM ${this.#tableName}
			WHERE id = $1
		`, [String(id)]);

		return result.rowCount === 1;
	}

	private async getRow(id: Identifier): Promise<RecordRow<TRecord> | undefined> {
		const result = await this.connection.query<RecordRow<TRecord>>(`
			SELECT data, version
			FROM ${this.#tableName}
			WHERE id = $1
		`, [String(id)]);

		return result.rows[0];
	}

	private updateByVersion(id: Identifier, version: number, data: TRecord) {
		return this.connection.query(`
			UPDATE ${this.#tableName}
			SET
				data = $1::jsonb,
				version = version + 1
			WHERE
				id = $2
				AND version = $3
		`, [JSON.stringify(data), String(id), version]);
	}

	private static parseData<TRecord>(data: TRecord | string): TRecord {
		if (typeof data === 'string')
			return JSON.parse(data);

		return data;
	}
}
