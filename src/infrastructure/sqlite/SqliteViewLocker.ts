import { Database, Statement } from 'better-sqlite3';
import { IExtendableLogger, ILogger, IViewLocker } from '../../interfaces';
import { Deferred } from '../memory';
import { promisify } from 'util';
import { viewLockTableInit } from './queries';
import { SqliteDbParams, SqliteProjectionDataParams } from './commonParams';
const delay = promisify(setTimeout);

export type SqliteViewLockerParams = SqliteDbParams & SqliteProjectionDataParams & {
	/**
	 * (Optional) SQLite table name where event locks along with the latest event are stored
	 * 
	 * @default "tbl_view_lock"
	 */
	viewLockTableName?: string;

	/**
	 * (Optional) Time-to-live (TTL) duration (in milliseconds) for which a view remains locked
	 * 
	 * @default 120_000
	 */
	viewLockTtl?: number;

	/**
	 * (Optional) Logger instance for logging operations,
	 * can be an IExtendableLogger (Winston)
	 * or ILogger (Console)
	 */
	logger?: IExtendableLogger | ILogger;
};

export class SqliteViewLocker implements IViewLocker {

	#db: Database;
	#projectionName: string;
	#schemaVersion: string;

	#viewLockTableName: string;
	#viewLockTtl: number;
	#logger: ILogger | undefined;

	#upsertTableLockQuery: Statement<[string, string, number], void>;
	#updateTableLockQuery: Statement<[number, string, string], void>;
	#removeTableLockQuery: Statement<[string, string], void>;

	#lockMarker: Deferred<void> | undefined;
	#lockProlongationTimeout: NodeJS.Timeout | undefined;

	constructor(o: SqliteViewLockerParams) {
		if (!o.viewModelSqliteDb)
			throw new TypeError('viewModelSqliteDb argument required');
		if (!o.projectionName)
			throw new TypeError('projectionName argument required');
		if (!o.schemaVersion)
			throw new TypeError('schemaVersion argument required');

		this.#db = o.viewModelSqliteDb;
		this.#projectionName = o.projectionName;
		this.#schemaVersion = o.schemaVersion;

		this.#viewLockTableName = o.viewLockTableName ?? 'tbl_view_lock';
		this.#viewLockTtl = o.viewLockTtl ?? 120_000;
		this.#logger = o.logger && 'child' in o.logger ?
			o.logger.child({ service: this.constructor.name }) :
			o.logger;

		this.#initialize();
	}

	#initialize() {
		this.#db.exec(viewLockTableInit(this.#viewLockTableName));

		this.#upsertTableLockQuery = this.#db.prepare(`
			INSERT INTO ${this.#viewLockTableName} (projection_name, schema_version, locked_till)
			VALUES (?, ?, ?)
			ON CONFLICT (projection_name, schema_version)
			DO UPDATE SET
				locked_till = excluded.locked_till
			WHERE
				locked_till IS NULL
				OR locked_till < excluded.locked_till
		`);

		this.#updateTableLockQuery = this.#db.prepare(`
			UPDATE ${this.#viewLockTableName}
			SET
				locked_till = ?
			WHERE
				projection_name = ?
				AND schema_version = ?
				AND locked_till IS NOT NULL
		`);

		this.#removeTableLockQuery = this.#db.prepare(`
			UPDATE ${this.#viewLockTableName}
			SET
				locked_till = NULL
			WHERE
				projection_name = ?
				AND schema_version = ?
				AND locked_till IS NOT NULL
		`);
	}

	get ready(): boolean {
		return !this.#lockMarker;
	}

	async lock() {
		this.#lockMarker = new Deferred();

		let lockAcquired = false;
		while (!lockAcquired) {
			const lockedTill = Date.now() + this.#viewLockTtl;
			const upsertResult = this.#upsertTableLockQuery.run(this.#projectionName, this.#schemaVersion, lockedTill);

			lockAcquired = upsertResult.changes === 1;
			if (!lockAcquired) {
				this.#logger?.debug(`"${this.#projectionName}" is locked by another process`);
				await delay(this.#viewLockTtl / 2);
			}
		}

		this.#logger?.debug(`"${this.#projectionName}" lock obtained for ${this.#viewLockTtl}s`);

		this.scheduleLockProlongation();

		return true;
	}

	private scheduleLockProlongation() {
		const ms = this.#viewLockTtl / 2;

		this.#lockProlongationTimeout = setTimeout(() => this.prolongLock(), ms);
		this.#lockProlongationTimeout.unref();

		this.#logger?.debug(`"${this.#projectionName}" lock refresh scheduled in ${ms} ms`);
	}

	private cancelLockProlongation() {
		clearTimeout(this.#lockProlongationTimeout);
		this.#logger?.debug(`"${this.#projectionName}" lock refresh canceled`);
	}

	private prolongLock() {
		const lockedTill = Date.now() + this.#viewLockTtl;
		const r = this.#updateTableLockQuery.run(lockedTill, this.#projectionName, this.#schemaVersion);
		if (r.changes !== 1)
			throw new Error(`"${this.#projectionName}" lock could not be prolonged`);

		this.#logger?.debug(`"${this.#projectionName}" lock prolonged for ${this.#viewLockTtl}s`);
	}

	unlock() {
		this.#lockMarker?.resolve();
		this.#lockMarker = undefined;

		this.cancelLockProlongation();

		const updateResult = this.#removeTableLockQuery.run(this.#projectionName, this.#schemaVersion);
		if (updateResult.changes === 1)
			this.#logger?.debug(`"${this.#projectionName}" lock released`);
		else
			this.#logger?.warn(`"${this.#projectionName}" lock didn't exist`);
	}

	once(event: 'ready'): Promise<void> {
		if (event !== 'ready')
			throw new TypeError(`Unexpected event: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}
}
