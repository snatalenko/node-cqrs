import { Statement, Database } from 'better-sqlite3';
import { guid } from './utils';
import { IObjectStorage } from '../interfaces';

export class SqliteObjectStorage<TRecord> implements IObjectStorage<TRecord> {

	#db: Database;
	#tableName: string;
	#getQuery: Statement<[Buffer], { data: string, version: number }>;
	#insertQuery: Statement<[Buffer, string], void>;
	#updateByIdAndVersionQuery: Statement<[string, Buffer, number], void>;
	#deleteQuery: Statement<[Buffer], void>;

	constructor(o: {
		viewModelSqliteDb: Database,
		tableName: string
	}) {
		if (!o.viewModelSqliteDb)
			throw new TypeError('viewModelSqliteDb argument required');
		if (!o.tableName)
			throw new TypeError('tableName argument required');

		this.#db = o.viewModelSqliteDb;
		this.#tableName = o.tableName;


		this.#db.exec(`CREATE TABLE IF NOT EXISTS ${this.#tableName} (
			id BLOB PRIMARY KEY,
			version INTEGER DEFAULT 1,
			data TEXT NOT NULL
		);`);

		this.#getQuery = this.#db.prepare(`
			SELECT data, version
			FROM ${this.#tableName}
			WHERE id = ?
		`);

		this.#insertQuery = this.#db.prepare(`
			INSERT INTO ${this.#tableName} (id, data)
			VALUES (?, ?)
		`);

		this.#updateByIdAndVersionQuery = this.#db.prepare(`
			UPDATE ${this.#tableName}
			SET
				data = ?,
				version = version + 1
			WHERE
				id = ?
				AND version = ?
		`);

		this.#deleteQuery = this.#db.prepare(`
			DELETE FROM ${this.#tableName}
			WHERE id = ?
		`);
	}

	get(id: string): TRecord | undefined {
		const r = this.#getQuery.get(guid(id));
		if (!r)
			return undefined;

		return JSON.parse(r.data);
	}

	create(id: string, data: TRecord) {
		const r = this.#insertQuery.run(guid(id), JSON.stringify(data));
		if (r.changes !== 1)
			throw new Error(`Record '${id}' could not be created`);

	}

	update(id: string, update: (r: TRecord) => TRecord) {
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

	updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		// Due to better-sqlite3 sync nature,
		// it's safe to get then modify within this process
		const record = this.#getQuery.get(guid(id));
		if (record)
			this.update(id, update);
		else
			this.create(id, update());
	}

	delete(id: string): boolean {
		const r = this.#deleteQuery.run(guid(id));
		return r.changes === 1;
	}
}
