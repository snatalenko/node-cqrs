import { Statement, Database } from 'better-sqlite3';
import { guid } from './utils';
import { IContainer, IObjectStorage } from '../interfaces';
import { AbstractSqliteAccessor } from './AbstractSqliteAccessor';

export class SqliteObjectStorage<TRecord> extends AbstractSqliteAccessor implements IObjectStorage<TRecord> {

	#tableName: string;
	#getQuery!: Statement<[Buffer], { data: string, version: number }>;
	#insertQuery!: Statement<[Buffer, string], void>;
	#updateByIdAndVersionQuery!: Statement<[string, Buffer, number], void>;
	#deleteQuery!: Statement<[Buffer], void>;

	constructor(o: Pick<IContainer, 'viewModelSqliteDb' | 'viewModelSqliteDbFactory'> & {
		tableName: string
	}) {
		super(o);

		this.#tableName = o.tableName;
	}

	protected initialize(db: Database) {
		db.exec(`CREATE TABLE IF NOT EXISTS ${this.#tableName} (
			id BLOB PRIMARY KEY,
			version INTEGER DEFAULT 1,
			data TEXT NOT NULL
		);`);

		this.#getQuery = db.prepare(`
			SELECT data, version
			FROM ${this.#tableName}
			WHERE id = ?
		`);

		this.#insertQuery = db.prepare(`
			INSERT INTO ${this.#tableName} (id, data)
			VALUES (?, ?)
		`);

		this.#updateByIdAndVersionQuery = db.prepare(`
			UPDATE ${this.#tableName}
			SET
				data = ?,
				version = version + 1
			WHERE
				id = ?
				AND version = ?
		`);

		this.#deleteQuery = db.prepare(`
			DELETE FROM ${this.#tableName}
			WHERE id = ?
		`);
	}

	async get(id: string): Promise<TRecord | undefined> {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		await this.assertConnection();

		const r = this.#getQuery.get(guid(id));
		if (!r)
			return undefined;

		return JSON.parse(r.data);
	}

	getSync(id: string): TRecord | undefined {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		const r = this.#getQuery.get(guid(id));
		if (!r)
			return undefined;

		return JSON.parse(r.data);
	}

	async create(id: string, data: TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		await this.assertConnection();

		const r = this.#insertQuery.run(guid(id), JSON.stringify(data));
		if (r.changes !== 1)
			throw new Error(`Record '${id}' could not be created`);
	}

	async update(id: string, update: (r: TRecord) => TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		await this.assertConnection();

		const gid = guid(id);
		const record = this.#getQuery.get(gid);
		if (!record)
			throw new Error(`Record '${id}' does not exist`);

		const data = JSON.parse(record.data);
		const updatedData = update(data);
		const updatedJson = JSON.stringify(updatedData);

		// Version check is implemented to ensure the record isn't modified by another process.
		// A conflict resolution strategy could potentially be passed as an option to this method,
		// but for now, conflict resolution should happen outside this class.
		const r = this.#updateByIdAndVersionQuery.run(updatedJson, gid, record.version);
		if (r.changes !== 1)
			throw new Error(`Record '${id}' could not be updated`);
	}

	async updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');
		if (typeof update !== 'function')
			throw new TypeError('update argument must be a Function');

		await this.assertConnection();

		// Due to better-sqlite3 sync nature,
		// it's safe to get then modify within this process
		const record = this.#getQuery.get(guid(id));
		if (record)
			await this.update(id, update);
		else
			await this.create(id, update());
	}

	async delete(id: string): Promise<boolean> {
		if (typeof id !== 'string' || !id.length)
			throw new TypeError('id argument must be a non-empty String');

		await this.assertConnection();

		const r = this.#deleteQuery.run(guid(id));
		return r.changes === 1;
	}
}
