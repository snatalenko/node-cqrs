import type { IContainer } from 'node-cqrs';
import type { ILogger, IViewLocker } from '../interfaces/index.ts';
import { assertNonNegativeInteger, assertString, Deferred } from '../utils/index.ts';
import { promisify } from 'util';
import { randomUUID } from 'node:crypto';
import type { PostgresqlConnection } from './PostgresqlConnection.ts';
import type { PostgresqlProjectionDataParams } from './PostgresqlProjectionDataParams.ts';
import { AbstractPostgresqlAccessor } from './AbstractPostgresqlAccessor.ts';
import { quoteIdentifier } from './utils/index.ts';

const delay = promisify(setTimeout);

export type PostgresqlViewLockerParams = PostgresqlProjectionDataParams & {

	/**
	 * (Optional) PostgreSQL table name where view locks and the latest event are stored.
	 *
	 * @default PostgresqlViewLocker.DEFAULT_TABLE
	 */
	viewLockTableName?: string;

	/**
	 * (Optional) Time-to-live (TTL) duration (in milliseconds) for which a view remains locked.
	 * The lock is automatically prolonged while still held by this instance.
	 *
	 * @default PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL
	 */
	viewLockTtl?: number;
};

/**
 * PostgreSQL-backed implementation of IViewLocker.
 *
 * Uses a row with token + locked_till semantics to acquire a distributed view lock.
 * The lock is automatically prolonged at half the TTL interval to prevent expiration
 * while processing is in progress.
 */
export class PostgresqlViewLocker extends AbstractPostgresqlAccessor implements IViewLocker {

	static DEFAULT_VIEW_LOCK_TTL = 120_000;
	static DEFAULT_TABLE = 'ncqrs_view_locks';

	readonly #projectionName: string;
	readonly #schemaVersion: string;
	readonly #viewLockTableName: string;
	readonly #viewLockTtl: number;
	readonly #logger: ILogger | undefined;
	#lockToken: string | undefined;
	#lockMarker: Deferred<void> | undefined;
	#lockProlongationTimeout: NodeJS.Timeout | undefined;

	constructor(o: Partial<Pick<IContainer, 'viewModelPostgresqlDb' | 'viewModelPostgresqlDbFactory' | 'logger'>>
		& PostgresqlViewLockerParams) {
		super(o);

		assertString(o.projectionName, 'o.projectionName');
		assertString(o.schemaVersion, 'o.schemaVersion');
		if (o.viewLockTableName !== undefined)
			assertString(o.viewLockTableName, 'o.viewLockTableName');
		if (o.viewLockTtl !== undefined)
			assertNonNegativeInteger(o.viewLockTtl, 'o.viewLockTtl');

		this.#projectionName = o.projectionName;
		this.#schemaVersion = o.schemaVersion;
		this.#viewLockTableName = quoteIdentifier(o.viewLockTableName ?? PostgresqlViewLocker.DEFAULT_TABLE);
		this.#viewLockTtl = o.viewLockTtl ?? PostgresqlViewLocker.DEFAULT_VIEW_LOCK_TTL;
		this.#logger = o.logger && 'child' in o.logger ?
			o.logger.child({ service: this.constructor.name }) :
			o.logger;
	}

	protected async initialize(db: PostgresqlConnection): Promise<void> {
		await db.query(`
			CREATE TABLE IF NOT EXISTS ${this.#viewLockTableName} (
				projection_name text NOT NULL,
				schema_version text NOT NULL,
				locked_till timestamptz NULL,
				lock_token text NULL,
				last_event text NULL,
				PRIMARY KEY (projection_name, schema_version)
			)
		`);

		await db.query(`
			CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableNameForIndex()}_locked_till_idx`)}
			ON ${this.#viewLockTableName} (locked_till)
		`);
	}

	get ready(): boolean {
		return !this.#lockMarker;
	}

	async lock(): Promise<boolean> {
		this.#lockMarker = new Deferred();
		this.#lockToken = randomUUID();

		await this.assertConnection();

		let lockAcquired = false;
		while (!lockAcquired) {
			const lockedTill = new Date(Date.now() + this.#viewLockTtl);
			const upsertResult = await this.connection.query(`
				INSERT INTO ${this.#viewLockTableName} AS view_lock
					(projection_name, schema_version, locked_till, lock_token)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (projection_name, schema_version)
				DO UPDATE SET
					locked_till = excluded.locked_till,
					lock_token = excluded.lock_token
				WHERE
					view_lock.locked_till IS NULL
					OR view_lock.locked_till < NOW()
			`, [this.#projectionName, this.#schemaVersion, lockedTill, this.#lockToken]);

			lockAcquired = upsertResult.rowCount === 1;
			if (!lockAcquired) {
				this.#logger?.debug(`"${this.#projectionName}" is locked by another process`);
				await delay(this.#viewLockTtl / 2);
			}
		}

		this.#logger?.debug(`"${this.#projectionName}" lock obtained for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();

		return true;
	}

	private scheduleLockProlongation() {
		const ms = this.#viewLockTtl / 2;

		this.#lockProlongationTimeout = setTimeout(() => this.prolongLock(), ms);
		this.#lockProlongationTimeout.unref();

		this.#logger?.debug(`"${this.#projectionName}" lock refresh scheduled in ${ms}ms`);
	}

	private cancelLockProlongation() {
		clearTimeout(this.#lockProlongationTimeout);
		this.#logger?.debug(`"${this.#projectionName}" lock refresh canceled`);
	}

	private async prolongLock() {
		await this.assertConnection();

		const lockedTill = new Date(Date.now() + this.#viewLockTtl);
		const result = await this.connection.query(`
			UPDATE ${this.#viewLockTableName}
			SET
				locked_till = $1
			WHERE
				projection_name = $2
				AND schema_version = $3
				AND lock_token = $4
				AND locked_till IS NOT NULL
		`, [lockedTill, this.#projectionName, this.#schemaVersion, this.#lockToken]);

		if (result.rowCount !== 1)
			throw new Error(`"${this.#projectionName}" lock could not be prolonged`);

		this.#logger?.debug(`"${this.#projectionName}" lock prolonged for ${this.#viewLockTtl}ms`);

		this.scheduleLockProlongation();
	}

	async unlock(): Promise<void> {
		this.#lockMarker?.resolve();
		this.#lockMarker = undefined;

		this.cancelLockProlongation();

		await this.assertConnection();

		const result = await this.connection.query(`
			UPDATE ${this.#viewLockTableName}
			SET
				locked_till = NULL,
				lock_token = NULL
			WHERE
				projection_name = $1
				AND schema_version = $2
				AND lock_token = $3
		`, [this.#projectionName, this.#schemaVersion, this.#lockToken]);

		this.#lockToken = undefined;

		if (result.rowCount === 1)
			this.#logger?.debug(`"${this.#projectionName}" lock released`);
		else
			this.#logger?.warn(`"${this.#projectionName}" lock didn't exist`);
	}

	once(event: 'ready'): Promise<void> {
		if (event !== 'ready')
			throw new TypeError(`Unexpected event: ${event}`);

		return this.#lockMarker?.promise ?? Promise.resolve();
	}

	#tableNameForIndex() {
		return this.#viewLockTableName.replaceAll('"', '').replaceAll('.', '_');
	}
}
