import * as BetterSqlite3 from 'better-sqlite3';
import { AbstractSqliteView, AbstractSqliteViewOptions } from "./AbstractSqliteView";
import { IObjectView, IPersistentView } from '../../interfaces';
import { guid } from './utils';

export class ObjectSqliteView<TRecord> extends AbstractSqliteView implements IObjectView<TRecord>, IPersistentView {

	#tableNamePrefix: string;
	#getQuery: BetterSqlite3.Statement<[Buffer], { data: string, version: number }>;
	#insertQuery: BetterSqlite3.Statement<[Buffer, string], void>;
	#updateByIdAndVersionQuery: BetterSqlite3.Statement<[string, Buffer, number], void>;
	#deleteQuery: BetterSqlite3.Statement<[Buffer], void>;

	get tableName(): string {
		return `${this.#tableNamePrefix}_${this.schemaVersion}`;
	}

	get eventLockTableName(): string {
		return `${this.#tableNamePrefix}_${this.schemaVersion}_event_lock`;
	}

	constructor(options: AbstractSqliteViewOptions & {
		tableNamePrefix: string,
		schemaVersion: string
	}) {
		if (typeof options.tableNamePrefix !== 'string' || !options.tableNamePrefix.length)
			throw new TypeError('options.tableNamePrefix argument must be a non-empty String');

		super(options);

		this.#tableNamePrefix = options.tableNamePrefix;

		this.initialize();
	}

	protected initialize(): void {
		super.initialize();

		this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName} (
			id BLOB PRIMARY KEY,
			version INTEGER DEFAULT 1,
			data TEXT NOT NULL
		);`);

		this.#getQuery = this.db.prepare(`
			SELECT data, version
			FROM ${this.tableName}
			WHERE id = ?
		`);

		this.#insertQuery = this.db.prepare(`
			INSERT INTO ${this.tableName} (id, data)
			VALUES (?, ?)
		`);

		this.#updateByIdAndVersionQuery = this.db.prepare(`
			UPDATE ${this.tableName}
			SET
				data = ?,
				version = version + 1
			WHERE
				id = ?
				AND version = ?
		`);

		this.#deleteQuery = this.db.prepare(`
			DELETE FROM ${this.tableName}
			WHERE id = ?
		`);

		this.logger?.info(`Table "${this.tableName}" initialized`);
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

		const r = this.#updateByIdAndVersionQuery.run(updatedJson, gid, record.version);
		if (r.changes !== 1)
			throw new Error(`Record '${id}' could not be updated`);
	}

	updateEnforcingNew(id: string, update: (r?: TRecord) => TRecord) {
		const gid = guid(id);
		const record = this.#getQuery.get(gid);
		if (record) {
			const data = JSON.parse(record.data);
			const updatedData = update(data);
			const updatedJson = JSON.stringify(updatedData);

			const r = this.#updateByIdAndVersionQuery.run(updatedJson, gid, record.version);
			if (r.changes !== 1)
				throw new Error(`Record '${id}' could not be updated`);
		}
		else {
			const newData = update();

			const r = this.#insertQuery.run(guid(id), JSON.stringify(newData));
			if (r.changes !== 1)
				throw new Error(`Record '${id}' could not be created`);
		}
	}

	delete(id: string): boolean {
		const r = this.#deleteQuery.run(guid(id));
		return r.changes === 1;
	}
}
