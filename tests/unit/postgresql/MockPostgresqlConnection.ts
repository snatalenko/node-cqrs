import type { PostgresqlConnection, PostgresqlQueryResult } from '../../../src/postgresql/index.ts';

type ViewLockRow = {
	lockedTill: Date | null;
	lockToken: string | null;
	lastEvent: string | null;
};

type EventLockRow = {
	processingAt: Date;
	processedAt: Date | null;
};

type ObjectRecord = {
	data: unknown;
	version: number;
};

type Snapshot = {
	viewLocks: Map<string, ViewLockRow>;
	eventLocks: Map<string, EventLockRow>;
	objectRecords: Map<string, ObjectRecord>;
};

export class MockPostgresqlConnection implements PostgresqlConnection {

	readonly viewLocks = new Map<string, ViewLockRow>();
	readonly eventLocks = new Map<string, EventLockRow>();
	readonly objectRecords = new Map<string, ObjectRecord>();
	readonly transactionLog: string[] = [];
	connectCount = 0;
	releaseCount = 0;
	forceObjectUpdateConflict = false;
	#transactionSnapshot: Snapshot | undefined;

	async connect() {
		this.connectCount++;

		return {
			query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
				text: string,
				values?: readonly unknown[]
			) => this.query<TRow>(text, values),
			release: () => {
				this.releaseCount++;
			}
		};
	}

	async query<TRow extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values: readonly unknown[] = []
	): Promise<PostgresqlQueryResult<TRow>> {
		const sql = text.replace(/\s+/g, ' ').trim().toLowerCase();

		if (sql === 'begin')
			return this.beginTransaction();

		if (sql === 'commit')
			return this.commitTransaction();

		if (sql === 'rollback')
			return this.rollbackTransaction();

		if (sql.startsWith('create '))
			return this.result();

		if (sql.includes('insert into') && sql.includes('locked_till') && values.length === 4)
			return this.acquireViewLock(values);

		if (sql.startsWith('update') && sql.includes('set locked_till = $1'))
			return this.prolongViewLock(values);

		if (sql.startsWith('update') && sql.includes('set locked_till = null'))
			return this.releaseViewLock(values);

		if (sql.includes('insert into') && sql.includes('event_id') && values.length === 4)
			return this.acquireEventLock(values);

		if (sql.startsWith('update') && sql.includes('processed_at = now()'))
			return this.finalizeEventLock(values);

		if (sql.includes('insert into') && sql.includes('last_event') && values.length === 3)
			return this.recordLastEvent(values);

		if (sql.startsWith('select') && sql.includes('last_event'))
			return this.getLastEvent(values);

		if (sql.includes('insert into') && sql.includes('(id, data)') && values.length === 2)
			return this.createObjectRecord(values);

		if (sql.startsWith('select') && sql.includes('data, version') && values.length === 1)
			return this.getObjectRecord(values);

		if (sql.startsWith('update') && sql.includes('data = $1::jsonb') && values.length === 3)
			return this.updateObjectRecord(values);

		if (sql.startsWith('delete from') && values.length === 1)
			return this.deleteObjectRecord(values);

		throw new Error(`Unexpected PostgreSQL query in mock: ${text}`);
	}

	expireEventLock(projectionName: string, schemaVersion: string, eventId: string, msAgo: number) {
		const lock = this.eventLocks.get(this.eventLockKey(projectionName, schemaVersion, eventId));
		if (lock)
			lock.processingAt = new Date(Date.now() - msAgo);
	}

	private beginTransaction() {
		this.transactionLog.push('BEGIN');
		this.#transactionSnapshot = {
			viewLocks: MockPostgresqlConnection.cloneViewLocks(this.viewLocks),
			eventLocks: MockPostgresqlConnection.cloneEventLocks(this.eventLocks),
			objectRecords: MockPostgresqlConnection.cloneObjectRecords(this.objectRecords)
		};

		return this.result();
	}

	private commitTransaction() {
		this.transactionLog.push('COMMIT');
		this.#transactionSnapshot = undefined;

		return this.result();
	}

	private rollbackTransaction() {
		this.transactionLog.push('ROLLBACK');

		if (this.#transactionSnapshot) {
			this.replaceMap(this.viewLocks, this.#transactionSnapshot.viewLocks);
			this.replaceMap(this.eventLocks, this.#transactionSnapshot.eventLocks);
			this.replaceMap(this.objectRecords, this.#transactionSnapshot.objectRecords);
		}

		this.#transactionSnapshot = undefined;

		return this.result();
	}

	private acquireViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lockedTill = values[2] as Date;
		const lockToken = String(values[3]);
		const current = this.viewLocks.get(key);

		if (current?.lockedTill && current.lockedTill.getTime() >= Date.now())
			return this.result(0);

		this.viewLocks.set(key, {
			lockedTill,
			lockToken,
			lastEvent: current?.lastEvent ?? null
		});

		return this.result(1);
	}

	private prolongViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[1]), String(values[2]));
		const lock = this.viewLocks.get(key);

		if (!lock?.lockedTill || lock.lockToken !== values[3])
			return this.result(0);

		lock.lockedTill = values[0] as Date;
		return this.result(1);
	}

	private releaseViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lock = this.viewLocks.get(key);

		if (!lock || lock.lockToken !== values[2])
			return this.result(0);

		lock.lockedTill = null;
		lock.lockToken = null;
		return this.result(1);
	}

	private acquireEventLock(values: readonly unknown[]) {
		const key = this.eventLockKey(String(values[0]), String(values[1]), String(values[2]));
		const ttl = Number(values[3]);
		const current = this.eventLocks.get(key);

		if (current) {
			if (current.processedAt || current.processingAt.getTime() > Date.now() - ttl)
				return this.result(0);

			current.processingAt = new Date();
			current.processedAt = null;
			return this.result(1);
		}

		this.eventLocks.set(key, {
			processingAt: new Date(),
			processedAt: null
		});

		return this.result(1);
	}

	private finalizeEventLock(values: readonly unknown[]) {
		const key = this.eventLockKey(String(values[0]), String(values[1]), String(values[2]));
		const lock = this.eventLocks.get(key);

		if (!lock || lock.processedAt)
			return this.result(0);

		lock.processedAt = new Date();
		return this.result(1);
	}

	private recordLastEvent(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const current = this.viewLocks.get(key);

		this.viewLocks.set(key, {
			lockedTill: current?.lockedTill ?? null,
			lockToken: current?.lockToken ?? null,
			lastEvent: String(values[2])
		});

		return this.result(1);
	}

	private getLastEvent<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lock = this.viewLocks.get(key);
		const rows = lock ? [{ last_event: lock.lastEvent }] as TRow[] : [];

		return this.result(rows.length, rows);
	}

	private createObjectRecord(values: readonly unknown[]) {
		const key = String(values[0]);
		if (this.objectRecords.has(key))
			return this.result(0);

		this.objectRecords.set(key, {
			data: JSON.parse(String(values[1])),
			version: 1
		});

		return this.result(1);
	}

	private getObjectRecord<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const record = this.objectRecords.get(String(values[0]));
		const rows = record ? [{ data: record.data, version: record.version }] as TRow[] : [];

		return this.result(rows.length, rows);
	}

	private updateObjectRecord(values: readonly unknown[]) {
		if (this.forceObjectUpdateConflict)
			return this.result(0);

		const record = this.objectRecords.get(String(values[1]));
		if (!record || record.version !== values[2])
			return this.result(0);

		record.data = JSON.parse(String(values[0]));
		record.version++;
		return this.result(1);
	}

	private deleteObjectRecord(values: readonly unknown[]) {
		return this.result(this.objectRecords.delete(String(values[0])) ? 1 : 0);
	}

	private viewLockKey(projectionName: string, schemaVersion: string) {
		return `${projectionName}:${schemaVersion}`;
	}

	private eventLockKey(projectionName: string, schemaVersion: string, eventId: string) {
		return `${projectionName}:${schemaVersion}:${eventId}`;
	}

	private result<TRow extends Record<string, unknown> = Record<string, unknown>>(
		rowCount: number | null = null,
		rows: TRow[] = []
	): PostgresqlQueryResult<TRow> {
		return { rowCount, rows };
	}

	private replaceMap<TKey, TValue>(target: Map<TKey, TValue>, source: Map<TKey, TValue>) {
		target.clear();
		for (const [key, value] of source)
			target.set(key, value);
	}

	private static cloneViewLocks(source: Map<string, ViewLockRow>) {
		const clone = new Map<string, ViewLockRow>();
		for (const [key, row] of source) {
			clone.set(key, {
				lockedTill: row.lockedTill ? new Date(row.lockedTill) : null,
				lockToken: row.lockToken,
				lastEvent: row.lastEvent
			});
		}

		return clone;
	}

	private static cloneEventLocks(source: Map<string, EventLockRow>) {
		const clone = new Map<string, EventLockRow>();
		for (const [key, row] of source) {
			clone.set(key, {
				processingAt: new Date(row.processingAt),
				processedAt: row.processedAt ? new Date(row.processedAt) : null
			});
		}

		return clone;
	}

	private static cloneObjectRecords(source: Map<string, ObjectRecord>) {
		const clone = new Map<string, ObjectRecord>();
		for (const [key, row] of source) {
			clone.set(key, {
				data: typeof row.data === 'object' && row.data !== null ?
					JSON.parse(JSON.stringify(row.data)) :
					row.data,
				version: row.version
			});
		}

		return clone;
	}
}
